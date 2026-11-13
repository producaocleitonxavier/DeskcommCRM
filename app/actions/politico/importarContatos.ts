"use server";

/**
 * IMPORTAÇÃO INTELIGENTE de contatos (político) — Excel (.xlsx) ou CSV.
 *
 * Duas ações:
 *  1) previewImportacao: lê a planilha, ADIVINHA o mapeamento das colunas e
 *     devolve cabeçalhos + sugestão + amostra pra tela de conferência.
 *  2) importarContatos: aplica o mapeamento CONFIRMADO pelo usuário, grava cada
 *     linha em `contacts` (+ `pol_leads`), deduplica por telefone, e devolve um
 *     relatório (importados / já existiam / com problema). No fim, religa cidade
 *     e zona eleitoral (RPCs pol_carimbar_*).
 *
 * O que não casa com nenhum campo vai pra `custom_fields.importacao_extra` —
 * NADA se perde. CPF via `camposCpfParaGravar` (par hash+cifra; sem cifra, salva
 * sem CPF, nunca falha a linha). Telefone normalizado pro padrão E.164 do CRM.
 */
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseImportFile } from "@/lib/crm-b2b/spreadsheet";
import { normalizaTelefone, normalizaData } from "@/lib/contacts/csv";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { camposCpfParaGravar } from "@/lib/contacts/cpf";
import {
  type CampoPolitico, sugerirMapeamento, normalizarCabecalho, ufDeTexto,
} from "@/lib/politico/importar-mapeamento";

export interface PreviewOk {
  ok: true;
  headers: string[];
  sugestao: Record<CampoPolitico, number | null>;
  amostra: string[][];
  totalLinhas: number;
}
export type ResultadoPreview = PreviewOk | { ok: false; erro: string };

export interface RelatorioImport {
  ok: true;
  totalLinhas: number;
  importados: number;
  duplicados: number;
  erros: { linha: number; motivo: string }[];
}
export type ResultadoImport = RelatorioImport | { ok: false; erro: string };

async function lerPlanilha(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) return { erro: "Nenhum arquivo enviado." as string };
  const bytes = await file.arrayBuffer();
  const parsed = await parseImportFile(bytes, file.name);
  if (!parsed.ok) return { erro: parsed.error ?? "Não consegui ler a planilha." };
  return { sheet: parsed.sheet };
}

export async function previewImportacao(formData: FormData): Promise<ResultadoPreview> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };

  const r = await lerPlanilha(formData);
  if ("erro" in r) return { ok: false, erro: r.erro };
  const { headers, rows } = r.sheet;
  return {
    ok: true,
    headers,
    sugestao: sugerirMapeamento(headers),
    amostra: rows.slice(0, 5),
    totalLinhas: rows.length,
  };
}

/** Separa etiquetas por vírgula/ponto-e-vírgula/barra. */
function fatiarTags(raw: string): string[] {
  return raw.split(/[,;/|]+/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);
}

export async function importarContatos(formData: FormData): Promise<ResultadoImport> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  const orgId = org.orgId;

  const mapRaw = formData.get("mapping");
  let mapa: Partial<Record<CampoPolitico, number | null>> = {};
  try {
    mapa = JSON.parse(typeof mapRaw === "string" ? mapRaw : "{}");
  } catch {
    return { ok: false, erro: "Mapeamento inválido." };
  }

  const r = await lerPlanilha(formData);
  if ("erro" in r) return { ok: false, erro: r.erro };
  const { headers, rows } = r.sheet;

  const admin = createAdminClient();
  const col = (linha: string[], campo: CampoPolitico): string => {
    const i = mapa[campo];
    return i != null && i >= 0 && i < linha.length ? (linha[i] ?? "").trim() : "";
  };
  // Índices já mapeados pra algum campo → o resto vira "extra" (nada se perde).
  const mapeados = new Set(Object.values(mapa).filter((v): v is number => typeof v === "number"));

  // Base de municípios (nome normalizado → {uf, nome oficial}) pra RECONHECER
  // cidade que veio no campo errado (bairro/complemento) e pra preencher o UF a
  // partir da cidade. Lê uma vez; a planilha pode ter milhares de linhas.
  const municipios = new Map<string, { uf: string; nome: string }>();
  {
    const { data } = await admin.from("intel_municipios").select("nome, uf");
    for (const m of (data ?? []) as { nome: string; uf: string }[]) {
      if (m.nome) municipios.set(normalizarCabecalho(m.nome), { uf: m.uf, nome: m.nome });
    }
  }

  const lote = Date.now().toString(36); // carimbo deste lote (pra rastrear/desfazer)
  let importados = 0;
  let duplicados = 0;
  const erros: { linha: number; motivo: string }[] = [];
  const telefonesDoArquivo = new Set<string>(); // dedupe dentro do próprio arquivo

  for (let i = 0; i < rows.length; i++) {
    const linha = rows[i]!;
    const numeroLinha = i + 2; // +1 cabeçalho, +1 base-1

    const nome = col(linha, "nome");
    const rawTel = col(linha, "telefone");
    const email = col(linha, "email");
    const tel = rawTel ? normalizaTelefone(rawTel) : null;

    // Linha vazia (sem nome, sem telefone útil, sem email) → pula sem erro.
    if (!nome && !tel && !email) continue;
    if (rawTel && !tel && !nome && !email) {
      erros.push({ linha: numeroLinha, motivo: `Telefone inválido: "${rawTel}"` });
      continue;
    }

    // Dedupe por telefone (dentro do arquivo e contra o banco).
    if (tel) {
      if (telefonesDoArquivo.has(tel)) { duplicados += 1; continue; }
      telefonesDoArquivo.add(tel);
      const existente = await encontrarContatoPorTelefone(admin, orgId, tel);
      if (existente) { duplicados += 1; continue; }
    }

    // custom_fields: endereço (compatível com pol_carimbar_cidade_leads) + extras.
    const endereco: Record<string, string> = {};
    let cidade = col(linha, "cidade");
    let estado = col(linha, "uf");
    let bairro = col(linha, "bairro");
    const logradouro = col(linha, "endereco");
    const numero = col(linha, "numero");
    let complemento = col(linha, "complemento");
    const cepRaw = col(linha, "cep");
    // INTELIGÊNCIA 1 — ESTADO por sigla/nome ("MG"/"Minas Gerais") no Bairro ou
    // Cidade, quando não veio em coluna própria: move pro lugar certo e limpa.
    if (!estado) {
      const ufB = ufDeTexto(bairro);
      const ufC = ufDeTexto(cidade);
      if (ufB) { estado = ufB; bairro = ""; }
      else if (ufC) { estado = ufC; cidade = ""; }
    }
    // INTELIGÊNCIA 2 — CIDADE que caiu no campo errado (Bairro/Complemento):
    // reconhece pela base de municípios, move pra Cidade (nome oficial) e
    // preenche o UF. Conserta "Contagem" no complemento, por exemplo.
    if (!cidade) {
      const mB = bairro ? municipios.get(normalizarCabecalho(bairro)) : undefined;
      const mC = complemento ? municipios.get(normalizarCabecalho(complemento)) : undefined;
      if (mB) { cidade = mB.nome; bairro = ""; if (!estado) estado = mB.uf; }
      else if (mC) { cidade = mC.nome; complemento = ""; if (!estado) estado = mC.uf; }
    }
    // INTELIGÊNCIA 3 — UF a partir da Cidade ("Belo Horizonte" → MG): completa o
    // estado de todo mundo, mesmo sem coluna de UF na planilha. Normaliza o nome.
    if (cidade) {
      const m = municipios.get(normalizarCabecalho(cidade));
      if (m) { cidade = m.nome; if (!estado) estado = m.uf; }
    }
    if (cidade) endereco.cidade = cidade;
    if (estado) endereco.estado = estado.toUpperCase().slice(0, 2);
    if (bairro) endereco.bairro = bairro;
    if (logradouro) endereco.logradouro = logradouro;
    if (numero) endereco.numero = numero;
    if (complemento) endereco.complemento = complemento;
    if (cepRaw) { const d = cepRaw.replace(/\D/g, ""); endereco.cep = d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cepRaw; }
    // Endereço COMPLETO montado (Logradouro, Número - Complemento) — o diferencial:
    // mesmo quando o número vem em coluna separada, ele entra no endereço.
    if (logradouro || numero) {
      endereco.completo = [logradouro, numero].filter(Boolean).join(", ") + (complemento ? ` - ${complemento}` : "");
    }

    const custom: Record<string, unknown> = {};
    if (Object.keys(endereco).length) custom.endereco_gip = endereco;
    const genero = col(linha, "genero");
    if (genero) custom.genero = genero;
    // Colunas não mapeadas → guardadas cruas (nada se perde).
    const extra: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (mapeados.has(c)) continue;
      const v = (linha[c] ?? "").trim();
      if (v) extra[normalizarCabecalho(headers[c] ?? `coluna_${c + 1}`)] = v;
    }
    if (Object.keys(extra).length) custom.importacao_extra = extra;

    const nascimento = normalizaData(col(linha, "nascimento"));
    const tags = fatiarTags(col(linha, "tags"));

    const insertRow: Record<string, unknown> = {
      organization_id: orgId,
      created_by_user_id: user.id,
      name: nome || null,
      display_name: nome || null,
      email: email || null,
      phone_number: tel,
      birthdate: nascimento,
      tags,
      source: "importacao_planilha",
      source_metadata: { importado_em: new Date().toISOString(), lote },
      consent: {},
      custom_fields: custom,
      // ANTI-BAN (9091): lista importada nasce FRIA = em quarentena. Não entra no
      // disparo em massa até esquentar por engajamento (a pessoa responder). É o
      // que impede repetir os 184 disparos que queimaram o chip do Gabinete
      // Digital. Origem morna (QR/inbound/evento/cadastro manual) nasce sem isto.
      em_quarentena: true,
    };
    const cpf = col(linha, "cpf");
    if (cpf) Object.assign(insertRow, await camposCpfParaGravar(admin, cpf));

    const { data: criado, error: insErr } = await admin
      .from("contacts")
      .insert(insertRow)
      .select("id")
      .single();
    if (insErr || !criado) {
      // 23505 = índice único (telefone/email/cpf já existe) → conta como duplicado.
      if ((insErr as { code?: string } | null)?.code === "23505") { duplicados += 1; continue; }
      erros.push({ linha: numeroLinha, motivo: insErr?.message ?? "Falha ao salvar" });
      continue;
    }

    // Vínculo eleitoral (pol_leads 1:1). Zona/seção do arquivo, se houver.
    const zona = col(linha, "zona_eleitoral");
    const secao = col(linha, "secao_eleitoral");
    await admin.from("pol_leads").insert({
      organization_id: orgId,
      contact_id: criado.id,
      support_level: "novo_cadastro",
      consent_origin: "importacao",
      zona_eleitoral: zona || null,
      secao_eleitoral: secao || null,
    });

    importados += 1;
  }

  // Religa cidade (territory_id) e zona eleitoral a partir do que foi importado.
  try { await admin.rpc("pol_carimbar_cidade_leads", { p_org: orgId }); } catch { /* best-effort */ }
  try { await admin.rpc("pol_carimbar_zonas_leads", { p_org: orgId }); } catch { /* best-effort */ }

  return { ok: true, totalLinhas: rows.length, importados, duplicados, erros: erros.slice(0, 50) };
}

/** Quantos contatos vieram por planilha (pra confirmar antes de excluir). */
export async function contarImportados(): Promise<{ ok: true; total: number } | { ok: false; erro: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida." };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.orgId)
    .eq("source", "importacao_planilha");
  if (error) return { ok: false, erro: error.message };
  return { ok: true, total: count ?? 0 };
}

/**
 * Exclui os contatos que ENTRARAM POR PLANILHA (source = importacao_planilha) +
 * seus vínculos eleitorais. Serve pra limpar e reimportar durante os testes.
 * Requer Gerente/Admin (é destrutivo). Não toca em contatos de outra origem.
 */
export async function excluirImportados(): Promise<{ ok: true; excluidos: number } | { ok: false; erro: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida." };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  const admin = createAdminClient();
  const orgId = org.orgId;

  const ids: string[] = [];
  for (let de = 0; de < 100_000; de += 1000) {
    const { data, error } = await admin
      .from("contacts").select("id")
      .eq("organization_id", orgId).eq("source", "importacao_planilha")
      .range(de, de + 999);
    if (error) return { ok: false, erro: error.message };
    const rows = (data ?? []) as { id: string }[];
    ids.push(...rows.map((r) => r.id));
    if (rows.length < 1000) break;
  }
  if (!ids.length) return { ok: true, excluidos: 0 };

  let excluidos = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    await admin.from("pol_leads").delete().eq("organization_id", orgId).in("contact_id", chunk);
    const { error } = await admin.from("contacts").delete().eq("organization_id", orgId).in("id", chunk);
    if (error) return { ok: false, erro: `Apaguei ${excluidos}, mas parei: ${error.message}` };
    excluidos += chunk.length;
  }
  return { ok: true, excluidos };
}

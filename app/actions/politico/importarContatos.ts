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
  type CampoPolitico, sugerirMapeamento, normalizarCabecalho,
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
  if (ROLE_RANK[org.role] < ROLE_RANK.agent) return { ok: false, erro: "Sem permissão." };

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
  if (ROLE_RANK[org.role] < ROLE_RANK.agent) return { ok: false, erro: "Sem permissão." };
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
    const cidade = col(linha, "cidade");
    const estado = col(linha, "uf");
    const bairro = col(linha, "bairro");
    const logradouro = col(linha, "endereco");
    if (cidade) endereco.cidade = cidade;
    if (estado) endereco.estado = estado.toUpperCase().slice(0, 2);
    if (bairro) endereco.bairro = bairro;
    if (logradouro) endereco.logradouro = logradouro;

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
      source_metadata: { importado_em: new Date().toISOString() },
      consent: {},
      custom_fields: custom,
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

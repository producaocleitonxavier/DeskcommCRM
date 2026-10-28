"use server";

/**
 * Server actions do Gabinete. OBRIGATÓRIO: o Supabase client do BROWSER não vê
 * a sessão (cookie httpOnly) → queries do browser saem como anônimo e a RLS
 * devolve vazio. Toda leitura/escrita de dados do gabinete passa por aqui, no
 * servidor, com o client autenticado (RLS libera a organização ativa).
 *
 * `organization_id` vem SEMPRE de resolveActiveOrg (nunca do input).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type AcaoResultado = { ok: true; id?: string } | { ok: false; erro: string };
export interface CidadaoOpcao {
  id: string;
  name: string | null;
  phone_number: string | null;
}
export interface AnexoDemanda {
  id: string;
  nome_arquivo: string;
  media_mime: string;
  media_size_bytes: number;
  created_at: string;
  /** URL assinada temporaria (1h) para baixar; null se o Storage recusou. */
  url: string | null;
}

const BUCKET_ANEXOS = "gabinete-anexos";

// Tabelas do gabinete que as actions podem gravar (whitelist).
const TABELAS = new Set(["demandas", "pol_liderancas", "pol_emendas", "pol_projetos_lei", "pol_agenda", "pol_obras", "pol_materiais", "pol_locais"]);

async function orgAtiva(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  return org?.orgId ?? null;
}

function traduzErro(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um registro com esse identificador.";
  if (error.code === "23514") return "Algum valor está fora do permitido para este campo.";
  return error.message;
}

function normalizarTelefone(tel: string): string | null {
  const d = tel.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return "+" + d;
  if (d.length === 10 || d.length === 11) return "+55" + d;
  return "+" + d;
}

/** Busca cidadãos (contacts) por nome, na org ativa. Server-side (autenticado). */
export async function buscarCidadaos(q: string): Promise<CidadaoOpcao[]> {
  const termo = q.trim();
  if (termo.length < 2) return [];
  const org = await orgAtiva();
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("contacts")
    .select("id, name, phone_number")
    .eq("organization_id", org)
    .ilike("name", `%${termo}%`)
    .order("name")
    .limit(8);
  return (data ?? []) as CidadaoOpcao[];
}

/** Cria um cidadão (contact) mínimo na org ativa e devolve o id. */
export async function criarCidadao(
  nome: string,
  telefone?: string,
  endereco?: string,
  nascimento?: string,
): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (!nome.trim()) return { ok: false, erro: "Informe o nome do cidadão." };
  const db = await createClient();
  const payload: Record<string, unknown> = { organization_id: org, name: nome.trim(), source: "gabinete" };
  const fone = telefone ? normalizarTelefone(telefone) : null;
  if (fone) payload.phone_number = fone;
  // Endereço vai no mesmo lugar que o resto do político usa (custom_fields.endereco_gip),
  // para alimentar a inteligência territorial.
  if (endereco?.trim()) payload.custom_fields = { endereco_gip: { endereco: endereco.trim() } };
  // Data de nascimento: coluna `birthdate` (YYYY-MM-DD, vinda do input date).
  // Só grava se vier no formato certo — nunca manda string vazia (quebra o tipo date).
  if (nascimento && /^\d{4}-\d{2}-\d{2}$/.test(nascimento.trim())) payload.birthdate = nascimento.trim();
  const { data, error } = await db.from("contacts").insert(payload).select("id").maybeSingle();
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, id: (data?.id as string | undefined) };
}

/**
 * Garante que um cidadão esteja na BASE (funil político) como `novo_cadastro`.
 * Idempotente: quem já é lead (qualquer nível) não é tocado. É o que faz o
 * solicitante de uma demanda "entrar no nosso cadastro" — pronto para nutrir.
 */
export async function garantirLeadNovoCadastro(contactId: string): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { data: existe } = await db
    .from("pol_leads")
    .select("id")
    .eq("organization_id", org)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (existe) return { ok: true, id: existe.id as string };
  const { data, error } = await db
    .from("pol_leads")
    .insert({ organization_id: org, contact_id: contactId, support_level: "novo_cadastro", consent_origin: "gabinete" })
    .select("id")
    .maybeSingle();
  if (error && error.code !== "23505") return { ok: false, erro: traduzErro(error) };
  return { ok: true, id: (data?.id as string | undefined) };
}

/**
 * Carimba a ZONA ELEITORAL provável nas pessoas da base, derivada do BAIRRO
 * (dados do TSE via intel_zona_do_bairro). Rodar depois de importar a base.
 * Eficiente (uma derivação por bairro distinto) e idempotente (só preenche o
 * que está vazio). Devolve quantas pessoas foram carimbadas.
 */
export async function carimbarZonasDosLeads(): Promise<{ ok: true; carimbados: number } | { ok: false; erro: string }> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { data, error } = await db.rpc("pol_carimbar_zonas_leads", { p_org: org });
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, carimbados: typeof data === "number" ? data : 0 };
}

/**
 * Religa a CIDADE (pol_leads.territory_id) à cidade do contato (custom_fields).
 * Necessário depois de importar/re-importar a base, que traz a cidade em
 * custom_fields mas não preenche o territory_id — sem isso o filtro de Cidade e
 * o mapa de calor ficam zerados. Idempotente (só onde territory_id é nulo).
 */
export async function carimbarCidadesDosLeads(): Promise<{ ok: true; carimbados: number } | { ok: false; erro: string }> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { data, error } = await db.rpc("pol_carimbar_cidade_leads", { p_org: org });
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, carimbados: typeof data === "number" ? data : 0 };
}

/** Insere um registro numa tabela do gabinete, escopado à org ativa. */
export async function criarRegistro(tabela: string, dados: Record<string, unknown>): Promise<AcaoResultado> {
  if (!TABELAS.has(tabela)) return { ok: false, erro: "Tabela inválida." };
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { data, error } = await db
    .from(tabela)
    .insert({ ...dados, organization_id: org })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, id: (data?.id as string | undefined) };
}

/** Atualiza um registro de uma tabela do gabinete (escopado à org ativa). */
export async function atualizarRegistro(tabela: string, id: string, patch: Record<string, unknown>): Promise<AcaoResultado> {
  if (!TABELAS.has(tabela)) return { ok: false, erro: "Tabela inválida." };
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from(tabela).update(patch).eq("id", id).eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

/** Registra um evento no histórico de uma demanda (escopado à org ativa). */
export async function registrarEventoDemanda(
  demandaId: string,
  tipo: "estado_alterado" | "nota" | "cidadao_avisado" | "oficio_emitido" | "encaminhamento_ia",
  descricao: string,
): Promise<AcaoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from("pol_demanda_eventos").insert({
    organization_id: org.orgId,
    demanda_id: demandaId,
    tipo,
    descricao,
    created_by: user.id,
  });
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

/** Exclui um registro de uma tabela do gabinete (escopado à org ativa). Para
 * `demandas`, os FKs cuidam do resto (anexos e vínculos de conversa em cascata,
 * referências em mensagens/conversas viram null). */
export async function excluirRegistro(tabela: string, id: string): Promise<AcaoResultado> {
  if (!TABELAS.has(tabela)) return { ok: false, erro: "Tabela inválida." };
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from(tabela).delete().eq("id", id).eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

/**
 * Lista os anexos de uma demanda com URL assinada (1h) para download. O upload
 * é pela rota multipart; aqui só leitura + assinatura. O bucket é privado (sem
 * policy de storage), por isso a URL é assinada pelo admin client.
 */
export async function listarAnexosDemanda(demandaId: string): Promise<AnexoDemanda[]> {
  const org = await orgAtiva();
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_demanda_anexos")
    .select("id, storage_path, nome_arquivo, media_mime, media_size_bytes, created_at")
    .eq("organization_id", org)
    .eq("demanda_id", demandaId)
    .order("created_at", { ascending: true });
  const linhas = (data ?? []) as {
    id: string;
    storage_path: string;
    nome_arquivo: string;
    media_mime: string;
    media_size_bytes: number;
    created_at: string;
  }[];
  if (linhas.length === 0) return [];

  const admin = createAdminClient();
  const out: AnexoDemanda[] = [];
  for (const a of linhas) {
    const { data: signed } = await admin.storage.from(BUCKET_ANEXOS).createSignedUrl(a.storage_path, 60 * 60);
    out.push({
      id: a.id,
      nome_arquivo: a.nome_arquivo,
      media_mime: a.media_mime,
      media_size_bytes: a.media_size_bytes,
      created_at: a.created_at,
      url: signed?.signedUrl ?? null,
    });
  }
  return out;
}

/**
 * Remove um anexo (escopado à org ativa). Apagar a linha dispara o gatilho
 * `trg_pol_anexo_expurgo`, que enfileira o arquivo na fila de expurgo — o worker
 * de LGPD remove o binário do bucket. Nada fica órfão.
 */
export async function removerAnexoDemanda(anexoId: string): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from("pol_demanda_anexos").delete().eq("id", anexoId).eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

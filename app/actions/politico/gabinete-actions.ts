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
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type AcaoResultado = { ok: true; id?: string } | { ok: false; erro: string };
export interface CidadaoOpcao {
  id: string;
  name: string | null;
  phone_number: string | null;
}

// Tabelas do gabinete que as actions podem gravar (whitelist).
const TABELAS = new Set(["demandas", "pol_liderancas", "pol_emendas", "pol_projetos_lei", "pol_agenda"]);

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
export async function criarCidadao(nome: string, telefone?: string): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (!nome.trim()) return { ok: false, erro: "Informe o nome do cidadão." };
  const db = await createClient();
  const payload: Record<string, unknown> = { organization_id: org, name: nome.trim(), source: "gabinete" };
  const fone = telefone ? normalizarTelefone(telefone) : null;
  if (fone) payload.phone_number = fone;
  const { data, error } = await db.from("contacts").insert(payload).select("id").maybeSingle();
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, id: (data?.id as string | undefined) };
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

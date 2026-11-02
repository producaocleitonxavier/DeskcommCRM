"use server";

/**
 * Server actions dos GRUPOS DE ORIGEM (camaleão). Como o resto do módulo
 * político, o client do browser não vê a sessão → tudo passa por aqui, no
 * servidor, com o client autenticado (a RLS libera só a org ativa).
 * `organization_id` vem SEMPRE de resolveActiveOrg, nunca do input.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type AcaoResultado = { ok: true; id?: string } | { ok: false; erro: string };

const TELA = "/app/politico/grupos-origem";

function traduzErro(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um grupo com esse nome.";
  return error.message;
}

async function contexto() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const db = await createClient();
  return { userId: user.id, orgId: org.orgId, db };
}

export async function criarGrupo(nome: string): Promise<AcaoResultado> {
  const limpo = (nome ?? "").trim();
  if (!limpo) return { ok: false, erro: "Dê um nome ao grupo." };
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: "Sessão ou organização inválida." };

  // Novo grupo entra no fim da ordem atual.
  const { count } = await ctx.db
    .from("pol_origem_grupos")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.orgId);

  const { data, error } = await ctx.db
    .from("pol_origem_grupos")
    .insert({ organization_id: ctx.orgId, nome: limpo, ordem: count ?? 0, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { ok: false, erro: traduzErro(error) };
  revalidatePath(TELA);
  return { ok: true, id: (data as { id: string }).id };
}

export async function renomearGrupo(id: string, nome: string): Promise<AcaoResultado> {
  const limpo = (nome ?? "").trim();
  if (!limpo) return { ok: false, erro: "Dê um nome ao grupo." };
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: "Sessão ou organização inválida." };

  const { error } = await ctx.db
    .from("pol_origem_grupos")
    .update({ nome: limpo, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", ctx.orgId);
  if (error) return { ok: false, erro: traduzErro(error) };
  revalidatePath(TELA);
  return { ok: true, id };
}

export async function apagarGrupo(id: string): Promise<AcaoResultado> {
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: "Sessão ou organização inválida." };

  // O mapeamento cai por cascade (on delete cascade) → as origens voltam a
  // "A classificar". Nenhum contato é tocado.
  const { error } = await ctx.db
    .from("pol_origem_grupos")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.orgId);
  if (error) return { ok: false, erro: traduzErro(error) };
  revalidatePath(TELA);
  return { ok: true };
}

/**
 * Move uma origem (source) para um grupo — ou a solta (`grupoId = null`), o que
 * a devolve para "A classificar". Upsert por (org, source): uma origem cai em um
 * grupo só.
 */
export async function moverOrigemParaGrupo(
  source: string,
  grupoId: string | null,
): Promise<AcaoResultado> {
  const src = (source ?? "").trim();
  if (!src) return { ok: false, erro: "Origem inválida." };
  const ctx = await contexto();
  if (!ctx) return { ok: false, erro: "Sessão ou organização inválida." };

  if (grupoId === null) {
    const { error } = await ctx.db
      .from("pol_origem_mapeamento")
      .delete()
      .eq("organization_id", ctx.orgId)
      .eq("source", src);
    if (error) return { ok: false, erro: traduzErro(error) };
    revalidatePath(TELA);
    return { ok: true };
  }

  const { error } = await ctx.db
    .from("pol_origem_mapeamento")
    .upsert(
      { organization_id: ctx.orgId, source: src, grupo_id: grupoId },
      { onConflict: "organization_id,source" },
    );
  if (error) return { ok: false, erro: traduzErro(error) };
  revalidatePath(TELA);
  return { ok: true };
}

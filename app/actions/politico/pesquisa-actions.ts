"use server";

/**
 * Pesquisa Relâmpago — Fase 1 (construtor). CRUD de pesquisas e perguntas sobre
 * o schema pol_surveys / pol_survey_questions. Gate manager+ (a tela é manager+).
 * O disparo (Fase 2) e os resultados (Fase 3) vêm em actions próprias.
 *
 * Melhorias vs WR1: nada de segredo no cliente, org SEMPRE de resolveActiveOrg
 * (nunca do argumento), papel checado no servidor.
 */
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

export type ResultadoPesquisa =
  | { ok: true; id: string }
  | { ok: false; erro: string };
export type ResultadoSimples = { ok: true } | { ok: false; erro: string };

export interface PerguntaInput {
  order: number;
  theme: string | null;
  question: string;
  response_type: "text" | "choice" | "scale" | "boolean" | "number" | "date" | "multi_choice";
  options: string[] | null;
  required: boolean;
}

/** org ativa só se Gerente+; devolve orgId ou null (sem vazar motivo). */
async function orgGerente(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const bypass = user.is_platform_admin && !user.support;
  if (!bypass && ROLE_RANK[org.role] < ROLE_RANK.manager) return null;
  return org.orgId;
}

export async function criarPesquisa(entrada: {
  title: string;
  description?: string;
  type?: string;
  theme?: string;
}): Promise<ResultadoPesquisa> {
  const orgId = await orgGerente();
  if (!orgId) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  const title = (entrada.title ?? "").trim();
  if (!title) return { ok: false, erro: "Informe um título." };

  const db = await createClient();
  const { data, error } = await db
    .from("pol_surveys")
    .insert({
      organization_id: orgId,
      title,
      description: (entrada.description ?? "").trim() || null,
      type: entrada.type ?? "field",
      theme: (entrada.theme ?? "").trim() || null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Não consegui criar a pesquisa agora." };
  revalidatePath("/app/politico/pesquisas");
  return { ok: true, id: String((data as { id: string }).id) };
}

export async function lerPerguntas(surveyId: string): Promise<PerguntaInput[]> {
  const orgId = await orgGerente();
  if (!orgId) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_survey_questions")
    .select("order, theme, question, response_type, options, required")
    .eq("organization_id", orgId)
    .eq("survey_id", surveyId)
    .order("order", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    order: Number(r.order ?? 0),
    theme: (r.theme as string | null) ?? null,
    question: String(r.question ?? ""),
    response_type: (r.response_type as PerguntaInput["response_type"]) ?? "text",
    options: Array.isArray(r.options) ? (r.options as string[]) : null,
    required: Boolean(r.required ?? true),
  }));
}

export async function salvarPerguntas(
  surveyId: string,
  perguntas: PerguntaInput[],
): Promise<ResultadoSimples> {
  const orgId = await orgGerente();
  if (!orgId) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  if (perguntas.some((p) => !p.question.trim())) return { ok: false, erro: "Toda pergunta precisa de texto." };

  const db = await createClient();
  // Confere que a pesquisa é da org (RLS já isola, isto é cinto e suspensório).
  const { data: dono } = await db
    .from("pol_surveys")
    .select("id")
    .eq("id", surveyId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!dono) return { ok: false, erro: "Pesquisa não encontrada." };

  // Substitui o conjunto (igual ao WR1): apaga as antigas e grava as novas.
  const { error: delErr } = await db.from("pol_survey_questions").delete().eq("survey_id", surveyId).eq("organization_id", orgId);
  if (delErr) return { ok: false, erro: "Não consegui salvar agora." };

  if (perguntas.length > 0) {
    const rows = perguntas.map((p, i) => ({
      organization_id: orgId,
      survey_id: surveyId,
      order: i,
      theme: p.theme,
      question: p.question.trim(),
      response_type: p.response_type,
      options: p.response_type === "multi_choice" || p.response_type === "choice"
        ? (p.options ?? []).map((o) => o.trim()).filter(Boolean)
        : null,
      required: p.required,
    }));
    const { error: insErr } = await db.from("pol_survey_questions").insert(rows);
    if (insErr) return { ok: false, erro: "Não consegui salvar as perguntas." };
  }
  revalidatePath(`/app/politico/pesquisas/${surveyId}/editar`);
  revalidatePath("/app/politico/pesquisas");
  return { ok: true };
}

export async function definirStatusPesquisa(surveyId: string, status: "draft" | "active" | "paused" | "completed" | "archived"): Promise<ResultadoSimples> {
  const orgId = await orgGerente();
  if (!orgId) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  const db = await createClient();
  const { error } = await db.from("pol_surveys").update({ status }).eq("id", surveyId).eq("organization_id", orgId);
  if (error) return { ok: false, erro: "Não consegui atualizar o status." };
  revalidatePath("/app/politico/pesquisas");
  return { ok: true };
}

export async function excluirPesquisa(surveyId: string): Promise<ResultadoSimples> {
  const orgId = await orgGerente();
  if (!orgId) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  const db = await createClient();
  const { error } = await db.from("pol_surveys").delete().eq("id", surveyId).eq("organization_id", orgId);
  if (error) return { ok: false, erro: "Não consegui excluir." };
  revalidatePath("/app/politico/pesquisas");
  return { ok: true };
}

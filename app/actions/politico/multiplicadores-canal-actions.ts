"use server";

/**
 * Ações do NÚMERO DEDICADO dos multiplicadores: listar os canais conectados e
 * escolher por qual deles sai o disparo (convites + links). Grava em
 * `organizations.settings.multiplicadores.canal_session_id` (jsonb, mesclando).
 * `organization_id` SEMPRE de resolveActiveOrg (nunca do input).
 */

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { CHAVE_CANAL, CHAVE_MULTIPLICADORES, lerCanalMultiplicadores } from "@/lib/politico/multiplicadores-canal";

export interface CanalDisponivel {
  id: string;
  rotulo: string;
}

/** Canais de mensagem conectados da org (pra escolher o número dos multiplicadores). */
export async function listarCanaisDisponiveis(): Promise<CanalDisponivel[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("channel_sessions")
    .select("id, display_name, phone_number, waha_session_name")
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as { id: string; display_name: string | null; phone_number: string | null; waha_session_name: string | null }[]).map(
    (c) => ({
      id: c.id,
      rotulo: (c.display_name || c.phone_number || c.waha_session_name || "Número sem nome").trim(),
    }),
  );
}

/** O canal atualmente escolhido pros multiplicadores (null = automático). */
export async function canalMultiplicadoresAtual(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const db = await createClient();
  const { data } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  return lerCanalMultiplicadores((data as { settings?: unknown } | null)?.settings);
}

export type CanalResultado = { ok: true } | { ok: false; erro: string };

/** Define (ou limpa, com null) o número dedicado dos multiplicadores. Mescla no jsonb. */
export async function definirCanalMultiplicadores(sessionId: string | null): Promise<CanalResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  const settings = ((data as { settings?: unknown } | null)?.settings ?? {}) as Record<string, unknown>;
  const mult = { ...((settings[CHAVE_MULTIPLICADORES] as Record<string, unknown> | undefined) ?? {}) };
  const limpo = (sessionId ?? "").trim();
  if (limpo) mult[CHAVE_CANAL] = limpo;
  else delete mult[CHAVE_CANAL];

  const novas = { ...settings, [CHAVE_MULTIPLICADORES]: mult };
  const { error } = await db.from("organizations").update({ settings: novas }).eq("id", org.orgId);
  if (error) return { ok: false, erro: error.message };

  revalidatePath("/app/politico/multiplicadores");
  return { ok: true };
}

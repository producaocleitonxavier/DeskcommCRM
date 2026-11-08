"use server";

/**
 * Presença de equipe em tarefa de campo (Incremento 3).
 *
 * O assessor marca "eu vou" numa visita/obra/evento — VÁRIOS podem marcar a
 * mesma. Fecha o laço: o gabinete vê quem vai. `organization_id` SEMPRE de
 * resolveActiveOrg, nunca do input (doutrina do gabinete).
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type PresencaResultado = { ok: true } | { ok: false; erro: string };
export type TarefaKind = "visita" | "obra" | "evento";

const KINDS = new Set<TarefaKind>(["visita", "obra", "evento"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O assessor logado marca "eu vou" numa tarefa de campo (idempotente). */
export async function marcarPresenca(kind: TarefaKind, tarefaId: string): Promise<PresencaResultado> {
  if (!KINDS.has(kind) || !UUID.test(tarefaId)) return { ok: false, erro: "Tarefa inválida." };
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Organização não encontrada." };

  const db = await createClient();
  const { error } = await db.from("pol_tarefa_presencas").upsert(
    {
      organization_id: org.orgId,
      tarefa_kind: kind,
      tarefa_id: tarefaId,
      user_id: user.id,
      nome: user.full_name ?? null, // desnormalizado p/ listar "quem vai" sem join a auth
    },
    { onConflict: "organization_id,tarefa_kind,tarefa_id,user_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, erro: "Não consegui marcar presença agora. Tente de novo." };
  return { ok: true };
}

/** O assessor desmarca ("não vou mais"). */
export async function desmarcarPresenca(kind: TarefaKind, tarefaId: string): Promise<PresencaResultado> {
  if (!KINDS.has(kind) || !UUID.test(tarefaId)) return { ok: false, erro: "Tarefa inválida." };
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Organização não encontrada." };

  const db = await createClient();
  const { error } = await db
    .from("pol_tarefa_presencas")
    .delete()
    .eq("organization_id", org.orgId)
    .eq("tarefa_kind", kind)
    .eq("tarefa_id", tarefaId)
    .eq("user_id", user.id);
  if (error) return { ok: false, erro: "Não consegui desmarcar agora. Tente de novo." };
  return { ok: true };
}

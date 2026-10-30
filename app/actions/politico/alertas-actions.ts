"use server";

/**
 * Ações da Central de Alertas — fecha o ciclo do alerta (antes era "em breve").
 * O operador move o alerta de 'aberto' para reconhecido/investigando/resolvido/
 * descartado. Gate Gerente+ (a tela já é manager+; defesa no servidor também).
 * Simples de propósito (regra de ouro): na tela, só Resolver e Descartar.
 */
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { orgSeAoMenos } from "@/lib/auth/server";

export type StatusAlerta = "open" | "acknowledged" | "investigating" | "resolved" | "dismissed";
const VALIDOS: StatusAlerta[] = ["open", "acknowledged", "investigating", "resolved", "dismissed"];

export async function definirStatusAlerta(
  id: string,
  status: StatusAlerta,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const orgId = await orgSeAoMenos("manager");
  if (!orgId) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  if (!VALIDOS.includes(status)) return { ok: false, erro: "Status inválido." };

  const db = await createClient();
  const { error } = await db
    .from("pol_alerts")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return { ok: false, erro: "Não consegui atualizar o alerta agora." };

  revalidatePath("/app/politico/alertas");
  return { ok: true };
}

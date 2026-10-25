/**
 * Enroll de uma pessoa recém-cadastrada num evento no fluxo de boas-vindas do
 * ebook — fixando o NÚMERO DEDICADO (Fase 2C Fatia 2).
 *
 * É a porta que o cadastro (`registrarPessoaEmEvento`) chama. Dormente-seguro: a
 * PRIMEIRA coisa que faz é checar `estaArmada()`; enquanto a máquina está
 * desligada ou sem canal, retorna sem tocar em nada. Best-effort — nunca derruba
 * o cadastro (o caller ignora o resultado).
 *
 * Usa o client ADMIN de ponta a ponta: `beginServiceAtOrigin` é "só chamadores
 * internos autorizadores" e fixa a conversa NAQUELE canal (o número dedicado),
 * que é o que define por onde a inscrição vai falar.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { logger } from "@/lib/logger";
import { lerEventosEnvioConfig, estaArmada, pointerDoEbook } from "./config";

export interface InscreverResultado {
  inscrito: boolean;
  /** "dormente" | "evento_sem_ebook" | "ebook_sem_fluxo" | "ok" | <código do enroll> */
  motivo: string;
}

export async function inscreverNoFluxoDeEvento(params: {
  orgId: string;
  eventId: string;
  contactId: string;
  actorUserId: string | null;
}): Promise<InscreverResultado> {
  const admin = createAdminClient();

  const cfg = await lerEventosEnvioConfig(admin, params.orgId);
  if (!estaArmada(cfg)) return { inscrito: false, motivo: "dormente" };
  const sessionId = cfg.channelSessionId!; // estaArmada garante não-nulo

  // Qual ebook o evento escolheu → qual fluxo publicado inscrever.
  const { data: ev } = await admin
    .from("pol_events")
    .select("material_id")
    .eq("organization_id", params.orgId)
    .eq("id", params.eventId)
    .maybeSingle();
  const materialId = (ev as { material_id?: unknown } | null)?.material_id;
  if (typeof materialId !== "string") return { inscrito: false, motivo: "evento_sem_ebook" };

  const pointerId = await pointerDoEbook(admin, params.orgId, materialId);
  if (!pointerId) return { inscrito: false, motivo: "ebook_sem_fluxo" };

  const r = await enrollFollowupFlow(admin, {
    organizationId: params.orgId,
    pointerId,
    contactId: params.contactId,
    actorUserId: params.actorUserId,
    requestId: crypto.randomUUID(),
    resolveServiceBoundary: () =>
      beginServiceAtOrigin(admin, params.orgId, params.contactId, sessionId),
  });

  if (!r.ok) {
    // "conflict" = já está num follow-up ativo (1 por lead): esperado, não é erro.
    if (r.code !== "conflict") {
      logger.warn("[eventos-envio] enroll falhou", { code: r.code, message: r.message });
    }
    return { inscrito: false, motivo: r.code };
  }
  return { inscrito: true, motivo: "ok" };
}

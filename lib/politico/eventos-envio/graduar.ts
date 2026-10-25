/**
 * Graduação dos que responderam "sim" ao consentimento (Fase 2C Fatia 2, peça 5).
 *
 * Quem percorre o fluxo de boas-vindas e responde "sim" fecha a inscrição como
 * `status='completed', outcome='converted'` (o fim FIM_MARCOU da escada). Esta
 * reconciliação varre essas inscrições e, para cada pessoa:
 *   1. sobe o lead `novo_cadastro → simpatizante` (UPDATE, não insert — o lead já
 *      existe do cadastro no evento);
 *   2. inscreve no drip mensal (se a máquina estiver armada e o drip publicado).
 *
 * IDEMPOTENTE por construção: o UPDATE só casa `support_level='novo_cadastro'`, e
 * só quem ACABOU de graduar entra no drip. Rodar de novo não regradua nem
 * reinscreve — quem já é simpatizante não casa o filtro. É o que permite chamar
 * isto de um cron sem levar duplicata.
 *
 * Diferença do funil do Instagram (`ig-captacao/qualificacao.ts::graduar`): lá é
 * INSERT (o lead pode não existir); aqui é UPDATE de um lead que nasceu no
 * cadastro do evento.
 */

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { logger } from "@/lib/logger";
import { lerEventosEnvioConfig, estaArmada } from "./config";

export interface GraduarResultado {
  graduados: number;
  inscritosNoDrip: number;
}

export async function graduarRespostasDeEvento(
  admin: SupabaseClient,
  orgId: string,
): Promise<GraduarResultado> {
  const resultado: GraduarResultado = { graduados: 0, inscritosNoDrip: 0 };

  // Ponteiros dos fluxos de boas-vindas de evento desta org.
  const { data: mapas } = await admin
    .from("pol_eventos_envio_ebook_fluxo")
    .select("pointer_id")
    .eq("organization_id", orgId);
  const pointers = [...new Set(((mapas ?? []) as { pointer_id: string }[]).map((m) => m.pointer_id))];
  if (pointers.length === 0) return resultado;

  // Inscrições concluídas com "sim" (converted).
  const { data: enrolls } = await admin
    .from("followup_enrollments")
    .select("contact_id")
    .eq("organization_id", orgId)
    .in("pointer_id", pointers)
    .eq("status", "completed")
    .eq("outcome", "converted");
  const contatos = [...new Set(((enrolls ?? []) as { contact_id: string }[]).map((e) => e.contact_id))];
  if (contatos.length === 0) return resultado;

  const cfg = await lerEventosEnvioConfig(admin, orgId);
  const podeDrip = estaArmada(cfg) && !!cfg.dripPointerId;

  for (const contactId of contatos) {
    // Sobe só quem ainda é novo_cadastro — o filtro é a trava de idempotência.
    const { data: grad } = await admin
      .from("pol_leads")
      .update({ support_level: "simpatizante" })
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .eq("support_level", "novo_cadastro")
      .select("id");
    if (!grad || grad.length === 0) continue; // já era simpatizante+ ou não é lead
    resultado.graduados++;

    if (!podeDrip) continue;
    const r = await enrollFollowupFlow(admin, {
      organizationId: orgId,
      pointerId: cfg.dripPointerId!,
      contactId,
      actorUserId: null,
      requestId: randomUUID(),
      resolveServiceBoundary: () =>
        beginServiceAtOrigin(admin, orgId, contactId, cfg.channelSessionId!),
    });
    if (r.ok) resultado.inscritosNoDrip++;
    else if (r.code !== "conflict") {
      logger.warn("[eventos-envio] enroll no drip falhou", { code: r.code, message: r.message });
    }
  }

  return resultado;
}

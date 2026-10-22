/**
 * Handler que roda a QUALIFICAÇÃO da captação (peça 2) a cada DM recebida.
 *
 * Irmão do `igInboundDmHandler` (que persiste a DM em `messages`): ambos
 * consomem `ig.dm_received`, com consumer_keys distintos (fan-out). Este só
 * avança a jornada de captação de quem é lead do funil — para os demais, é
 * no-op (`skipped`).
 */

import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { qualificarPorDm } from "@/lib/ig-captacao/qualificacao";

export const IG_CAPTACAO_DM_CONSUMER_KEY = "ig.captacao_qualificacao";

export const igCaptacaoDmHandler: EventHandler = {
  key: IG_CAPTACAO_DM_CONSUMER_KEY,
  events: ["ig.dm_received"],
  naOrgParada: "roda",

  async handle(row: EventRow): Promise<HandlerResult> {
    const { organization_id, payload } = row;
    const senderId = typeof payload.sender_id === "string" ? payload.sender_id : null;
    const channelSessionId =
      typeof payload.channel_session_id === "string" ? payload.channel_session_id : null;
    const text = typeof payload.text === "string" ? payload.text : null;

    if (!senderId || !text) {
      return {
        consumer_key: IG_CAPTACAO_DM_CONSUMER_KEY,
        status: "skipped",
        detail: "payload_incompleto",
      };
    }

    try {
      const admin = createAdminClient();
      const r = await qualificarPorDm(admin, organization_id, senderId, channelSessionId, text);
      return { consumer_key: IG_CAPTACAO_DM_CONSUMER_KEY, status: r.status, detail: r.detail };
    } catch (err) {
      logger.error("[ig-captacao-dm] erro na qualificação", {
        eventId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        consumer_key: IG_CAPTACAO_DM_CONSUMER_KEY,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

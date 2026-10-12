/**
 * Worker handler que consome `ig.comment_received` do event_log e cria a linha
 * correspondente em `ig_comment_events`.
 *
 * ── Fluxo ──────────────────────────────────────────────────────────────────────
 * 1. Webhook (`ig-webhooks/route.ts`) recebe o comentário do Meta e emite
 *    `ig.comment_received` no event_log
 * 2. ESTE handler consome o evento e grava a linha em `ig_comment_events`
 * 3. O motor de automação (`ig-automacoes/motor.handler.ts`) consome o MESMO
 *    evento `ig.comment_received`, lê de `ig_comment_events` e avalia os flows
 *
 * Este handler DEVE rodar ANTES do motor de automação no register-handlers,
 * porque o motor lê de `ig_comment_events` — sem a linha, ele não encontra nada.
 *
 * Idempotência via unique (organization_id, instagram_comment_id).
 */

import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const IG_INBOUND_COMMENT_CONSUMER_KEY = "ig.inbound_comment_persister";

export const igInboundCommentHandler: EventHandler = {
  key: IG_INBOUND_COMMENT_CONSUMER_KEY,
  events: ["ig.comment_received"],
  // Escrita curta no banco — roda mesmo com org parada
  naOrgParada: "roda",

  async handle(row: EventRow): Promise<HandlerResult> {
    const admin = createAdminClient();
    const { organization_id, payload } = row;

    const commentId = typeof payload.comment_id === "string" ? payload.comment_id : null;
    const fromId = typeof payload.from_id === "string" ? payload.from_id : null;

    if (!commentId || !fromId) {
      logger.warn("[ig-inbound-comment] payload incompleto", {
        eventId: row.id,
        hasCommentId: !!commentId,
        hasFromId: !!fromId,
      });
      return {
        consumer_key: IG_INBOUND_COMMENT_CONSUMER_KEY,
        status: "skipped",
        detail: "payload_incompleto",
      };
    }

    const channelSessionId =
      typeof payload.channel_session_id === "string" ? payload.channel_session_id : null;

    const { error } = await admin.from("ig_comment_events").insert({
      organization_id,
      channel_session_id: channelSessionId,
      instagram_comment_id: commentId,
      instagram_media_id: typeof payload.media_id === "string" ? payload.media_id : null,
      from_instagram_id: fromId,
      from_username: typeof payload.from_username === "string" ? payload.from_username : null,
      texto: typeof payload.text === "string" ? payload.text : null,
      parent_comment_id: typeof payload.parent_id === "string" ? payload.parent_id : null,
      field: "comments",
      raw_payload: payload,
      processado: false,
    });

    if (error) {
      // Idempotência: unique violation = já processado
      if (error.code === "23505") {
        return {
          consumer_key: IG_INBOUND_COMMENT_CONSUMER_KEY,
          status: "ok",
          detail: "duplicado_ignorado",
        };
      }

      logger.error("[ig-inbound-comment] insert error", {
        eventId: row.id,
        error,
        organization_id,
      });
      return {
        consumer_key: IG_INBOUND_COMMENT_CONSUMER_KEY,
        status: "error",
        detail: `insert_error: ${error.message}`,
      };
    }

    return {
      consumer_key: IG_INBOUND_COMMENT_CONSUMER_KEY,
      status: "ok",
      detail: `comment_persisted: ${commentId}`,
    };
  },
};

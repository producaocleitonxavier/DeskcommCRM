/**
 * Worker handler que consome `ig.mention_received` do event_log e cria a linha
 * correspondente em `ig_comment_events` (com `field = 'mentions'`).
 *
 * ── Fluxo ──────────────────────────────────────────────────────────────────────
 * 1. Webhook (`ig-webhooks/route.ts`) recebe a menção do Meta e emite
 *    `ig.mention_received` no event_log
 * 2. ESTE handler consome o evento e grava a linha em `ig_comment_events`
 *
 * Idempotência via unique (organization_id, instagram_comment_id), onde
 * `instagram_comment_id` é sintético: `mention_${media_id}_${from_id}`.
 */

import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const IG_INBOUND_MENTION_CONSUMER_KEY = "ig.inbound_mention_persister";

export const igInboundMentionHandler: EventHandler = {
  key: IG_INBOUND_MENTION_CONSUMER_KEY,
  events: ["ig.mention_received"],
  // Escrita curta no banco — roda mesmo com org parada
  naOrgParada: "roda",

  async handle(row: EventRow): Promise<HandlerResult> {
    const admin = createAdminClient();
    const { organization_id, payload } = row;

    const mediaId = typeof payload.media_id === "string" ? payload.media_id : null;
    const fromId = typeof payload.from_id === "string" ? payload.from_id : null;

    if (!mediaId || !fromId) {
      logger.warn("[ig-inbound-mention] payload incompleto", {
        eventId: row.id,
        hasMediaId: !!mediaId,
        hasFromId: !!fromId,
      });
      return {
        consumer_key: IG_INBOUND_MENTION_CONSUMER_KEY,
        status: "skipped",
        detail: "payload_incompleto",
      };
    }

    const syntheticCommentId = `mention_${mediaId}_${fromId}`;

    const channelSessionId =
      typeof payload.channel_session_id === "string" ? payload.channel_session_id : null;

    const { error } = await admin.from("ig_comment_events").insert({
      organization_id,
      channel_session_id: channelSessionId,
      instagram_comment_id: syntheticCommentId,
      instagram_media_id: mediaId,
      from_instagram_id: fromId,
      from_username: typeof payload.from_username === "string" ? payload.from_username : null,
      texto: null,
      parent_comment_id: null,
      field: "mentions",
      raw_payload: payload,
      processado: false,
    });

    if (error) {
      // Idempotência: unique violation = já processado
      if (error.code === "23505") {
        return {
          consumer_key: IG_INBOUND_MENTION_CONSUMER_KEY,
          status: "ok",
          detail: "duplicado_ignorado",
        };
      }

      logger.error("[ig-inbound-mention] insert error", {
        eventId: row.id,
        error,
        organization_id,
      });
      return {
        consumer_key: IG_INBOUND_MENTION_CONSUMER_KEY,
        status: "error",
        detail: `insert_error: ${error.message}`,
      };
    }

    return {
      consumer_key: IG_INBOUND_MENTION_CONSUMER_KEY,
      status: "ok",
      detail: `mention_persisted: ${syntheticCommentId}`,
    };
  },
};

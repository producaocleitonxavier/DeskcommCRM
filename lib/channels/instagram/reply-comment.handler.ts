/**
 * Worker handler que consome `ig.comment_reply_outbound` do event_log e posta
 * a resposta real ao comentário via Instagram Graph API.
 *
 * ── Fluxo ──────────────────────────────────────────────────────────────────────
 * 1. Motor de automação avalia o comentário recebido
 * 2. Executor `responder_comentario` (`acoes.ts`) emite `ig.comment_reply_outbound`
 * 3. ESTE handler consome o evento e chama `responderComentarioInstagram`
 */

import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { igCredsForChannelSessionId } from "./credentials";
import { responderComentarioInstagram } from "./reply-comment";
import { logger } from "@/lib/logger";

export const IG_COMMENT_REPLY_CONSUMER_KEY = "ig.comment_reply_sender";

export const igCommentReplyHandler: EventHandler = {
  key: IG_COMMENT_REPLY_CONSUMER_KEY,
  events: ["ig.comment_reply_outbound"],
  naOrgParada: "pula",

  async handle(row: EventRow): Promise<HandlerResult> {
    const admin = createAdminClient();
    const { organization_id, payload } = row;

    const instagramCommentId =
      typeof payload.instagram_comment_id === "string" ? payload.instagram_comment_id : null;
    const texto = typeof payload.texto === "string" ? payload.texto : null;

    if (!instagramCommentId || !texto) {
      logger.warn("[ig-reply-handler] payload incompleto", {
        eventId: row.id,
        hasCommentId: !!instagramCommentId,
        hasTexto: !!texto,
      });
      return {
        consumer_key: IG_COMMENT_REPLY_CONSUMER_KEY,
        status: "skipped",
        detail: "payload_incompleto",
      };
    }

    // Resolver credenciais — buscar pelo ig_comment_events para achar o channel_session_id
    const commentEventId = row.entity_id;
    let channelSessionId: string | null = null;

    if (commentEventId) {
      const { data: comentario } = await admin
        .from("ig_comment_events")
        .select("channel_session_id")
        .eq("id", commentEventId)
        .eq("organization_id", organization_id)
        .maybeSingle();
      channelSessionId = comentario?.channel_session_id ?? null;
    }

    if (!channelSessionId) {
      logger.warn("[ig-reply-handler] sem channel_session_id", {
        eventId: row.id,
        commentEventId,
        organization_id,
      });
      return {
        consumer_key: IG_COMMENT_REPLY_CONSUMER_KEY,
        status: "error",
        detail: "sem_channel_session_id",
      };
    }

    let creds;
    try {
      creds = await igCredsForChannelSessionId(admin, organization_id, channelSessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[ig-reply-handler] erro ao resolver credenciais", {
        error: msg,
        channelSessionId,
      });
      return {
        consumer_key: IG_COMMENT_REPLY_CONSUMER_KEY,
        status: "error",
        detail: `creds_error: ${msg}`,
      };
    }

    if (!creds) {
      return {
        consumer_key: IG_COMMENT_REPLY_CONSUMER_KEY,
        status: "error",
        detail: "sem_credenciais",
      };
    }

    const result = await responderComentarioInstagram(creds, {
      instagramCommentId,
      text: texto,
    });

    if (!result.ok) {
      if (result.httpStatus === 429) {
        return {
          consumer_key: IG_COMMENT_REPLY_CONSUMER_KEY,
          status: "retry",
          retry_at: new Date(Date.now() + 60_000).toISOString(),
          detail: `rate_limited: ${result.error}`,
        };
      }

      return {
        consumer_key: IG_COMMENT_REPLY_CONSUMER_KEY,
        status: "error",
        detail: result.error ?? "resposta_falhou",
      };
    }

    // Gravar o reply_comment_id para rastreabilidade
    if (result.commentId && commentEventId) {
      await admin
        .from("ig_comment_events")
        .update({
          reply_comment_id: result.commentId,
          resposta_comentario_at: new Date().toISOString(),
        })
        .eq("id", commentEventId)
        .eq("organization_id", organization_id)
        .then(() => {});
    }

    return {
      consumer_key: IG_COMMENT_REPLY_CONSUMER_KEY,
      status: "ok",
      detail: `reply_posted: ${result.commentId ?? "sem_id"}`,
    };
  },
};

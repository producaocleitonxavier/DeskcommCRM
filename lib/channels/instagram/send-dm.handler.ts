/**
 * Worker handler que consome `ig.dm_outbound` do event_log e envia a DM real
 * via Instagram Graph API.
 *
 * ── Fluxo ──────────────────────────────────────────────────────────────────────
 * 1. Motor de automação (`motor.handler.ts`) avalia um comentário recebido
 * 2. Executor `enviar_dm` (`acoes.ts`) emite `ig.dm_outbound` no event_log
 * 3. ESTE handler consome o evento, resolve credenciais e chama `enviarDmInstagram`
 *
 * Separar a intenção (evento) da execução (HTTP) é a mesma arquitetura que o
 * WhatsApp usa: o webhook handler nunca faz HTTP direto, e o retry fica no
 * dispatcher do event_log.
 */

import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { igCredsForChannelSessionId } from "./credentials";
import { enviarDmInstagram, type IgDmAttachment, type IgAttachmentType } from "./send-dm";
import { logger } from "@/lib/logger";

const ATTACHMENT_TYPES = new Set<string>(["image", "video", "audio"]);

export const IG_DM_OUTBOUND_CONSUMER_KEY = "ig.dm_outbound_sender";

export const igDmOutboundHandler: EventHandler = {
  key: IG_DM_OUTBOUND_CONSUMER_KEY,
  events: ["ig.dm_outbound"],
  // Envio de DM sai por rede de terceiro — pula se a organização está parada
  naOrgParada: "pula",

  async handle(row: EventRow): Promise<HandlerResult> {
    const admin = createAdminClient();
    const { organization_id, payload } = row;

    const channelSessionId =
      typeof payload.channel_session_id === "string" ? payload.channel_session_id : null;
    const toInstagramId =
      typeof payload.to_instagram_id === "string" ? payload.to_instagram_id : null;
    const texto = typeof payload.texto === "string" ? payload.texto : null;

    // Attachment de mídia (image/video/audio)
    let attachment: IgDmAttachment | undefined;
    if (
      payload.attachment &&
      typeof payload.attachment === "object" &&
      typeof (payload.attachment as Record<string, unknown>).type === "string" &&
      ATTACHMENT_TYPES.has((payload.attachment as Record<string, unknown>).type as string) &&
      typeof (payload.attachment as Record<string, unknown>).url === "string"
    ) {
      attachment = {
        type: (payload.attachment as Record<string, unknown>).type as IgAttachmentType,
        url: (payload.attachment as Record<string, unknown>).url as string,
      };
    }

    if (!channelSessionId || !toInstagramId || (!texto && !attachment)) {
      logger.warn("[ig-dm-handler] payload incompleto", {
        eventId: row.id,
        channelSessionId,
        toInstagramId,
        hasTexto: !!texto,
        hasAttachment: !!attachment,
      });
      return {
        consumer_key: IG_DM_OUTBOUND_CONSUMER_KEY,
        status: "skipped",
        detail: "payload_incompleto",
      };
    }

    // Resolver credenciais da sessão
    let creds;
    try {
      creds = await igCredsForChannelSessionId(admin, organization_id, channelSessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[ig-dm-handler] erro ao resolver credenciais", {
        error: msg,
        channelSessionId,
        organization_id,
      });
      return {
        consumer_key: IG_DM_OUTBOUND_CONSUMER_KEY,
        status: "error",
        detail: `creds_error: ${msg}`,
      };
    }

    if (!creds) {
      logger.warn("[ig-dm-handler] sem credenciais para sessão", {
        channelSessionId,
        organization_id,
      });
      return {
        consumer_key: IG_DM_OUTBOUND_CONSUMER_KEY,
        status: "error",
        detail: "sem_credenciais",
      };
    }

    // Enviar DM real via Graph API
    const result = await enviarDmInstagram(creds, {
      recipientId: toInstagramId,
      ...(texto ? { text: texto } : {}),
      ...(attachment ? { attachment } : {}),
    });

    if (!result.ok) {
      // Rate limit da Graph API → retry
      if (result.httpStatus === 429) {
        return {
          consumer_key: IG_DM_OUTBOUND_CONSUMER_KEY,
          status: "retry",
          retry_at: new Date(Date.now() + 60_000).toISOString(),
          detail: `rate_limited: ${result.error}`,
        };
      }

      return {
        consumer_key: IG_DM_OUTBOUND_CONSUMER_KEY,
        status: "error",
        detail: result.error ?? "envio_falhou",
      };
    }

    // Gravar o message_id retornado no ig_comment_events para rastreabilidade
    if (result.messageId && row.entity_id) {
      await admin
        .from("ig_comment_events")
        .update({
          dm_message_id: result.messageId,
          dm_enviada_at: new Date().toISOString(),
        })
        .eq("id", row.entity_id)
        .eq("organization_id", organization_id)
        .then(() => {});
    }

    return {
      consumer_key: IG_DM_OUTBOUND_CONSUMER_KEY,
      status: "ok",
      detail: `dm_enviada: ${result.messageId ?? "sem_id"}`,
    };
  },
};

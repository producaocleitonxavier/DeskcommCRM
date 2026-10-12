/**
 * Envio real de DMs via Instagram Messaging API (Graph API).
 *
 * Endpoint: POST /{page_id}/messages
 *
 * ── Requisitos ────────────────────────────────────────────────────────────────
 * - Conta Instagram Business conectada a uma Facebook Page
 * - Permissão `instagram_manage_messages`
 * - A conversa precisa estar aberta (janela de 24h após última interação do user)
 *
 * ── Particularidades vs WhatsApp Cloud ────────────────────────────────────────
 * - O destinatário é o IGSID (Instagram Scoped ID), não um phone number
 * - O envio vai pelo Page ID (não pelo Business Account ID)
 * - A janela de 24h é contada a partir do último toque do user (não do envio)
 * - Fora da janela, só `HUMAN_AGENT` tag (requer aprovação Meta)
 *
 * Ref: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
 */

import { graphBaseUrl } from "@/lib/channels/meta/graph-base";
import { logger } from "@/lib/logger";
import type { IgCredentials } from "./credentials";

/** Tipos de attachment suportados pela Messaging API do Instagram */
export type IgAttachmentType = "image" | "video" | "audio";

export interface IgDmAttachment {
  /** Tipo de mídia */
  type: IgAttachmentType;
  /** URL pública do asset (precisa ser acessível pela Meta) */
  url: string;
}

export interface IgDmRequest {
  /** IGSID do destinatário */
  recipientId: string;
  /** Texto da mensagem (obrigatório quando não há attachment) */
  text?: string;
  /** Attachment de mídia (imagem, vídeo ou áudio). Mutuamente exclusivo com texto na mesma mensagem na API do IG. */
  attachment?: IgDmAttachment;
  /** Tag de mensagem (para fora da janela de 24h) */
  messageTag?: "HUMAN_AGENT";
}

export interface IgDmResult {
  ok: boolean;
  /** ID da mensagem retornado pela Graph API */
  messageId?: string;
  error?: string;
  httpStatus?: number;
}

/**
 * Envia uma DM para o Instagram user via Graph API.
 *
 * Usa o Page ID (não o Business Account ID) como remetente, porque a
 * Messaging API do Instagram é operada pela Facebook Page vinculada.
 */
export async function enviarDmInstagram(
  creds: IgCredentials,
  req: IgDmRequest,
): Promise<IgDmResult> {
  if (!creds.pageId) {
    return {
      ok: false,
      error: "ig_page_id_ausente: DM requer o Page ID da Facebook Page vinculada",
    };
  }

  if (!req.text && !req.attachment) {
    return {
      ok: false,
      error: "ig_dm_sem_conteudo: DM precisa de text ou attachment",
    };
  }

  const url = `${graphBaseUrl(creds.graphVersion)}/${creds.pageId}/messages`;

  // Instagram Messaging API: text e attachment são mutuamente exclusivos
  // dentro do objeto `message`. Para enviar ambos, são duas chamadas.
  const messagePayload: Record<string, unknown> = {};
  if (req.attachment) {
    messagePayload.attachment = {
      type: req.attachment.type,
      payload: { url: req.attachment.url },
    };
  } else {
    messagePayload.text = req.text;
  }

  const body: Record<string, unknown> = {
    recipient: { id: req.recipientId },
    message: messagePayload,
  };

  if (req.messageTag) {
    body.messaging_type = "MESSAGE_TAG";
    body.tag = req.messageTag;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const errMsg =
        typeof json.error === "object" && json.error !== null
          ? (json.error as Record<string, unknown>).message ?? res.statusText
          : res.statusText;
      logger.error("[ig-send-dm] Graph API error", {
        status: res.status,
        error: errMsg,
        pageId: creds.pageId,
        recipientId: req.recipientId,
      });
      return {
        ok: false,
        error: `graph_api_error: ${errMsg}`,
        httpStatus: res.status,
      };
    }

    const messageId = typeof json.message_id === "string" ? json.message_id : undefined;

    logger.info("[ig-send-dm] DM enviada", {
      messageId,
      pageId: creds.pageId,
      recipientId: req.recipientId,
    });

    return { ok: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[ig-send-dm] fetch failed", { error: msg });
    return { ok: false, error: `fetch_failed: ${msg}` };
  }
}

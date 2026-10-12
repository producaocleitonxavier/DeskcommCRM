/**
 * Resposta real a comentários via Instagram Graph API.
 *
 * Endpoint: POST /{comment_id}/replies
 *
 * ── Requisitos ────────────────────────────────────────────────────────────────
 * - Conta Instagram Business com permissão `instagram_manage_comments`
 * - O comentário original precisa existir (não deletado)
 * - Rate limit: 60 chamadas/hora por Business Account
 *
 * Ref: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing#replies
 */

import { graphBaseUrl } from "@/lib/channels/meta/graph-base";
import { logger } from "@/lib/logger";
import type { IgCredentials } from "./credentials";

export interface IgCommentReplyRequest {
  /** ID do comentário no Instagram (para responder) */
  instagramCommentId: string;
  /** Texto da resposta */
  text: string;
}

export interface IgCommentReplyResult {
  ok: boolean;
  /** ID do comentário de resposta criado */
  commentId?: string;
  error?: string;
  httpStatus?: number;
}

/**
 * Responde a um comentário no Instagram via Graph API.
 *
 * POST /{comment_id}/replies com `message` no body.
 */
export async function responderComentarioInstagram(
  creds: IgCredentials,
  req: IgCommentReplyRequest,
): Promise<IgCommentReplyResult> {
  const url = `${graphBaseUrl(creds.graphVersion)}/${req.instagramCommentId}/replies`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: req.text }),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const errMsg =
        typeof json.error === "object" && json.error !== null
          ? (json.error as Record<string, unknown>).message ?? res.statusText
          : res.statusText;
      logger.error("[ig-reply-comment] Graph API error", {
        status: res.status,
        error: errMsg,
        commentId: req.instagramCommentId,
      });
      return {
        ok: false,
        error: `graph_api_error: ${errMsg}`,
        httpStatus: res.status,
      };
    }

    const commentId = typeof json.id === "string" ? json.id : undefined;

    logger.info("[ig-reply-comment] Comentário respondido", {
      replyId: commentId,
      originalCommentId: req.instagramCommentId,
    });

    return { ok: true, commentId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[ig-reply-comment] fetch failed", { error: msg });
    return { ok: false, error: `fetch_failed: ${msg}` };
  }
}

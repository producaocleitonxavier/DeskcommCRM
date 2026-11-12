/**
 * Parser de comentários do Instagram Graph API.
 *
 * O Instagram Graph API entrega comentários via webhooks com objeto "instagram"
 * e campo "comments". Este parser transforma o payload bruto em um tipo
 * estruturado `IgCommentEvent`, validado com Zod.
 *
 * Diferente do canal Zernio (DMs), os comentários vêm direto da Meta Graph API
 * — o mesmo App que entrega eventos do WhatsApp Cloud API — mas com payload
 * completamente diferente.
 *
 * Ref: https://developers.facebook.com/docs/instagram-platform/webhooks/
 */
import { z } from "zod";

// ── Schema do payload da Meta Graph API para comentários ──────────────────────

const igCommentValueSchema = z.object({
  id: z.string().min(1),                          // Instagram comment ID
  text: z.string().optional(),
  media: z
    .object({
      id: z.string().optional(),                  // Media ID onde foi comentado
      media_product_type: z.string().optional(),  // 'FEED', 'REELS', 'STORY'
    })
    .optional(),
  from: z
    .object({
      id: z.string().min(1),
      username: z.string().optional(),
    })
    .optional(),
  parent_id: z.string().optional(),               // Se é reply de comentário
  timestamp: z.number().optional(),
});

const igChangeSchema = z.object({
  field: z.enum(["comments", "mentions", "live_comments"]),
  value: igCommentValueSchema,
});

const igEntrySchema = z.object({
  id: z.string(),                                  // IG Business Account ID
  time: z.number().optional(),
  changes: z.array(igChangeSchema),
});

const igWebhookPayloadSchema = z.object({
  object: z.literal("instagram"),
  entry: z.array(igEntrySchema),
});

// ── Tipo de saída ─────────────────────────────────────────────────────────────

export interface IgCommentEvent {
  /** ID único do comentário no Instagram */
  commentId: string;
  /** Instagram Business Account ID que recebeu o evento */
  businessAccountId: string;
  /** Media/Post onde o comentário foi feito */
  mediaId: string | null;
  /** ID Instagram do autor do comentário */
  fromId: string;
  /** @username do autor */
  fromUsername: string | null;
  /** Texto do comentário */
  texto: string | null;
  /** ID do comentário pai (se é reply) */
  parentId: string | null;
  /** Campo do webhook: 'comments' | 'mentions' | 'live_comments' */
  field: "comments" | "mentions" | "live_comments";
  /** Timestamp do comentário (epoch segundos) */
  timestamp: number | null;
}

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Parse o payload bruto de um webhook Instagram Graph API.
 *
 * Retorna array de eventos de comentário (pode ser vazio se o payload não
 * contiver campos de comentário, ou se falhar a validação).
 *
 * NUNCA lança — retorna array vazio em caso de payload malformado.
 */
export function parseIgWebhookPayload(
  payload: unknown,
  businessAccountId?: string,
): IgCommentEvent[] {
  const parsed = igWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) return [];

  const events: IgCommentEvent[] = [];

  for (const entry of parsed.data.entry) {
    const accountId = businessAccountId ?? entry.id;

    for (const change of entry.changes) {
      const v = change.value;
      if (!v.from?.id) continue; // comentário sem autor — descartamos

      events.push({
        commentId: v.id,
        businessAccountId: accountId,
        mediaId: v.media?.id ?? null,
        fromId: v.from.id,
        fromUsername: v.from.username ?? null,
        texto: v.text ?? null,
        parentId: v.parent_id ?? null,
        field: change.field,
        timestamp: v.timestamp ?? null,
      });
    }
  }

  return events;
}

/**
 * Verificação HMAC-SHA256 da assinatura Meta Graph API.
 *
 * O cabeçalho `x-hub-signature-256` tem o formato `sha256=<hex>`.
 * O corpo bruto (string ou Buffer) é assado com o App Secret.
 *
 * Retorna `true` se a assinatura é válida, `false` caso contrário.
 */
export async function verifyIgWebhookSignature(
  body: string,
  signature: string,
  appSecret: string,
): Promise<boolean> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");

  const expected = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");

  if (expected.length !== signature.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Confere a assinatura contra VÁRIAS chaves e diz qual casou (pelo índice).
 *
 * Por que mais de uma: o aviso do Instagram é assinado com a chave do APLICATIVO
 * DO INSTAGRAM (a mesma do login, `IG_APP_SECRET`), que pode ser diferente da
 * chave do aplicativo da Meta usada pelo canal oficial de WhatsApp — e esta
 * última, quando configurada pela tela, fica no banco e tem precedência sobre o
 * ambiente. Conferir só contra ela recusava todo aviso verdadeiro do Instagram
 * como "assinatura inválida". Todas as candidatas são chaves NOSSAS; aceitar
 * qualquer uma não afrouxa nada, e quem não tem nenhuma delas segue barrado.
 *
 * Devolve -1 quando nenhuma casa. Chaves vazias ou repetidas são ignoradas.
 */
export async function assinaturaValidaComAlguma(
  body: string,
  signature: string,
  segredos: readonly (string | null | undefined)[],
): Promise<number> {
  const vistos = new Set<string>();
  for (let i = 0; i < segredos.length; i++) {
    const segredo = (segredos[i] ?? "").trim();
    if (!segredo || vistos.has(segredo)) continue;
    vistos.add(segredo);
    if (await verifyIgWebhookSignature(body, signature, segredo)) return i;
  }
  return -1;
}

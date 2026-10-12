/**
 * GET/POST /api/v1/ig-webhooks
 *
 * Endpoint para webhooks do Instagram via Facebook Graph API.
 *
 * GET  — Verificação de webhook (challenge/response). Meta envia uma requisição
 *        GET quando o webhook é configurado no painel do app. O endpoint valida
 *        o `verify_token` e retorna o `challenge`.
 *
 * POST — Recebimento de eventos (comentários, DMs, menções). Valida a assinatura
 *        HMAC SHA256 do payload e emite eventos no `event_log` para processamento
 *        assíncrono pelos handlers existentes.
 *
 * Ref: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Verificação de webhook (GET) ────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.IG_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    logger.warn("[ig-webhooks] IG_WEBHOOK_VERIFY_TOKEN not configured");
    return new Response("Not configured", { status: 503 });
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    logger.info("[ig-webhooks] Webhook verified");
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

// ── Recebimento de eventos (POST) ───────────────────────────────────────────

interface IgWebhookEntry {
  id: string; // Page ID
  time: number;
  messaging?: IgMessagingEvent[];
  changes?: IgChangeEvent[];
}

interface IgMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: { url?: string };
    }>;
  };
}

interface IgChangeEvent {
  field: string;
  value: {
    from: { id: string; username?: string };
    media?: { id: string; media_product_type?: string };
    id: string;
    text?: string;
    parent_id?: string;
    created_time?: number;
    verb?: string;
  };
}

interface IgWebhookPayload {
  object: string;
  entry: IgWebhookEntry[];
}

function verifySignature(body: string, signature: string | null, appSecret: string): boolean {
  if (!signature) return false;

  // Formato: sha256=<hex>
  const parts = signature.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;

  const expected = createHmac("sha256", appSecret).update(body, "utf8").digest("hex");
  const received = parts[1]!;

  if (expected.length !== received.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const appSecret = process.env.IG_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!appSecret) {
    logger.warn("[ig-webhooks] IG_APP_SECRET not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Ler o body como text para validação da assinatura
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature, appSecret)) {
    logger.warn("[ig-webhooks] Invalid signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  let payload: IgWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as IgWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (payload.object !== "instagram" && payload.object !== "page") {
    // Não é um evento de Instagram — ignorar silenciosamente
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();

  for (const entry of payload.entry) {
    // Resolver a organização pela Page ID
    const { data: session } = await admin
      .from("channel_sessions")
      .select("id, organization_id, ig_business_account_id")
      .eq("provider", "instagram")
      .eq("ig_page_id", entry.id)
      .is("archived_at", null)
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    if (!session) {
      logger.debug("[ig-webhooks] No session for page", { pageId: entry.id });
      continue;
    }

    // ── Mensagens diretas (DMs) ─────────────────────────────────
    if (entry.messaging) {
      for (const msg of entry.messaging) {
        if (!msg.message) continue;

        // Ignorar mensagens enviadas por nós
        if (msg.sender.id === entry.id) continue;

        await admin.from("event_log").insert({
          id: randomUUID(),
          organization_id: session.organization_id,
          event_type: "ig.dm_received",
          entity_kind: "channel_session",
          entity_id: session.id,
          payload: {
            channel_session_id: session.id,
            ig_business_account_id: session.ig_business_account_id,
            sender_id: msg.sender.id,
            recipient_id: msg.recipient.id,
            message_id: msg.message.mid,
            text: msg.message.text ?? null,
            attachments: msg.message.attachments ?? [],
            timestamp: msg.timestamp,
          },
          status: "pending",
        });
      }
    }

    // ── Mudanças (comentários, menções) ──────────────────────────
    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.field === "comments") {
          // Ignorar remoções
          if (change.value.verb === "remove") continue;

          await admin.from("event_log").insert({
            id: randomUUID(),
            organization_id: session.organization_id,
            event_type: "ig.comment_received",
            entity_kind: "channel_session",
            entity_id: session.id,
            payload: {
              channel_session_id: session.id,
              ig_business_account_id: session.ig_business_account_id,
              comment_id: change.value.id,
              text: change.value.text ?? "",
              from_id: change.value.from.id,
              from_username: change.value.from.username ?? null,
              media_id: change.value.media?.id ?? null,
              parent_id: change.value.parent_id ?? null,
              created_time: change.value.created_time ?? null,
            },
            status: "pending",
          });
        } else if (change.field === "mentions") {
          await admin.from("event_log").insert({
            id: randomUUID(),
            organization_id: session.organization_id,
            event_type: "ig.mention_received",
            entity_kind: "channel_session",
            entity_id: session.id,
            payload: {
              channel_session_id: session.id,
              ig_business_account_id: session.ig_business_account_id,
              media_id: change.value.media?.id ?? null,
              from_id: change.value.from.id,
              from_username: change.value.from.username ?? null,
            },
            status: "pending",
          });
        }
      }
    }
  }

  // Meta espera 200 rápido; processamento real é assíncrono via event_log
  return NextResponse.json({ received: true });
}

/**
 * GET/POST /api/v1/cron/ig-token-refresh
 *
 * Renova tokens de longa duração do Instagram Business que estão perto de
 * expirar. Tokens do Graph API duram 60 dias; este cron roda diariamente e
 * renova quando faltam ≤7 dias.
 *
 * O Graph API permite renovar um long-lived token que ainda não expirou via
 * GET /oauth/access_token?grant_type=fb_exchange_token&...
 * O novo token dura mais 60 dias a partir da troca.
 *
 * Auth: Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET, fail-closed.
 * Não audita rodada vazia (mesma doutrina dos demais crons).
 */

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DIAS_ANTES_DE_RENOVAR = 7;

interface TokenRefreshResult {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function renovarToken(
  currentToken: string,
): Promise<TokenRefreshResult | null> {
  // Instagram Login: renova o long-lived com ig_refresh_token (não usa
  // client_id/secret). Dura mais 60 dias a partir da troca.
  const url = new URL(`https://graph.instagram.com/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentToken);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      logger.warn("[ig-token-refresh] Graph API error", { status: res.status, body });
      return null;
    }
    return (await res.json()) as TokenRefreshResult;
  } catch (err) {
    logger.error("[ig-token-refresh] fetch error", { error: err });
    return null;
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!autorizaCron(req)) {
    return fail("unauthorized", "Cron auth required", 401, { requestId });
  }

  const appId = process.env.IG_APP_ID ?? process.env.META_APP_ID;
  const appSecret = process.env.IG_APP_SECRET ?? process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return ok({ refreshed: 0, skipped: 0, message: "IG_APP_ID/IG_APP_SECRET not configured" }, { requestId });
  }

  const admin = createAdminClient();

  // Buscar sessões Instagram com token próximo de expirar
  const limiteRenovacao = new Date(
    Date.now() + DIAS_ANTES_DE_RENOVAR * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: sessions, error: queryError } = await admin
    .from("channel_sessions")
    .select("id, organization_id, ig_business_account_id, ig_access_token_encrypted, ig_token_expires_at")
    .eq("provider", "instagram")
    .eq("status", "WORKING")
    .is("archived_at", null)
    .not("ig_access_token_encrypted", "is", null)
    .lte("ig_token_expires_at", limiteRenovacao);

  if (queryError) {
    logger.error("[ig-token-refresh] query error", { error: queryError });
    return fail("internal_error", "Failed to query sessions", 500, { requestId });
  }

  if (!sessions || sessions.length === 0) {
    // Rodada vazia — não audita (doutrina de crons)
    return ok({ refreshed: 0, skipped: 0 }, { requestId });
  }

  let refreshed = 0;
  let skipped = 0;

  for (const session of sessions) {
    try {
      // Decifrar o token atual
      const currentToken = await decryptWebhookSecret(
        admin,
        session.ig_access_token_encrypted,
      );

      if (!currentToken) {
        logger.warn("[ig-token-refresh] failed to decrypt token", {
          sessionId: session.id,
          orgId: session.organization_id,
        });
        skipped++;
        continue;
      }

      // Renovar via Graph API do Instagram
      const result = await renovarToken(currentToken);
      if (!result) {
        logger.warn("[ig-token-refresh] refresh failed", {
          sessionId: session.id,
          orgId: session.organization_id,
        });

        // Se o token já expirou, marcar como disconnected
        if (session.ig_token_expires_at && new Date(session.ig_token_expires_at) < new Date()) {
          await admin
            .from("channel_sessions")
            .update({ status: "STOPPED" })
            .eq("id", session.id);
        }

        skipped++;
        continue;
      }

      // Cifrar o novo token
      const encrypted = await encryptWebhookSecret(admin, result.access_token);
      if (!encrypted) {
        logger.warn("[ig-token-refresh] failed to encrypt new token", {
          sessionId: session.id,
        });
        skipped++;
        continue;
      }

      // Atualizar no banco
      const newExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();

      const { error: updateError } = await admin
        .from("channel_sessions")
        .update({
          ig_access_token_encrypted: encrypted,
          ig_token_expires_at: newExpiresAt,
          status: "WORKING",
        })
        .eq("id", session.id);

      if (updateError) {
        logger.error("[ig-token-refresh] update error", {
          sessionId: session.id,
          error: updateError,
        });
        skipped++;
        continue;
      }

      refreshed++;

      void audit({
        action: "instagram.oauth_connected",
        organizationId: session.organization_id,
        resourceType: "channel_session",
        resourceId: session.id,
        requestId,
        metadata: {
          reason: "token_refresh",
          ig_business_account_id: session.ig_business_account_id,
          new_expires_at: newExpiresAt,
        },
      });
    } catch (err) {
      logger.error("[ig-token-refresh] unexpected error", {
        sessionId: session.id,
        error: err,
      });
      skipped++;
    }
  }

  if (refreshed > 0) {
    logger.info("[ig-token-refresh] done", { refreshed, skipped });
  }

  return ok({ refreshed, skipped }, { requestId });
}

export const POST = GET;

/**
 * GET /api/v1/ig-oauth/callback
 *
 * OAuth callback do Instagram Business. Troca o código por token, cifra e grava
 * em `channel_sessions` com provider='instagram'.
 *
 * Segue o padrão do Nuvemshop callback:
 * 1. Valida state (HMAC + expiração)
 * 2. Troca código por short-lived token
 * 3. Troca short-lived por long-lived token (60 dias)
 * 4. Busca as Pages e contas IG Business vinculadas
 * 5. Cifra o token e upserta em channel_sessions
 * 6. Redireciona de volta à UI com ?ok=1 ou ?error=<code>
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { audit } from "@/lib/audit";
import {
  verifyIgOAuthState,
  exchangeIgCode,
  exchangeIgLongLivedToken,
  fetchIgProfile,
  resolvePublicBaseUrl,
  type IgOAuthConfig,
} from "@/lib/channels/instagram/oauth";

export const dynamic = "force-dynamic";

const UI_PATH = "/app/instagram/conectar";

function redirectTo(path: string, base: string): NextResponse {
  return NextResponse.redirect(new URL(path, base));
}

function getOAuthConfig(baseUrl: string): IgOAuthConfig | null {
  const appId = process.env.IG_APP_ID ?? process.env.META_APP_ID;
  const appSecret = process.env.IG_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    redirectUri: `${baseUrl}/api/v1/ig-oauth/callback`,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  const baseUrl = resolvePublicBaseUrl(req.headers);

  const config = getOAuthConfig(baseUrl);
  if (!config) {
    return redirectTo(`${UI_PATH}?error=not_configured`, baseUrl);
  }

  // 1. Validar state
  const state = verifyIgOAuthState(stateParam);
  if (!state) {
    void audit({
      action: "instagram.oauth_failed",
      metadata: { reason: "invalid_state" },
    });
    return redirectTo(`${UI_PATH}?error=invalid_state`, baseUrl);
  }

  if (!code) {
    // Usuário cancelou o OAuth no Facebook
    const errorReason = url.searchParams.get("error_reason") ?? "missing_code";
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: errorReason },
    });
    return redirectTo(`${UI_PATH}?error=${errorReason}`, baseUrl);
  }

  const admin = createAdminClient();

  // 2. Trocar código por short-lived token
  const shortLived = await exchangeIgCode(config, code);
  if (!shortLived) {
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "code_exchange_failed" },
    });
    return redirectTo(`${UI_PATH}?error=code_exchange_failed`, baseUrl);
  }

  // 3. Trocar por long-lived token (60 dias)
  const longLived = await exchangeIgLongLivedToken(config, shortLived.accessToken);
  if (!longLived) {
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "long_lived_exchange_failed" },
    });
    return redirectTo(`${UI_PATH}?error=long_lived_exchange_failed`, baseUrl);
  }

  // 4. Identificar a conta Instagram conectada.
  // No Instagram Login não há Pages: a conta vem do próprio token (user_id) e
  // confirmamos o username pelo /me da graph.instagram.com.
  const profile = await fetchIgProfile(longLived.accessToken);
  const igUserId = profile?.igUserId || shortLived.userId;
  if (!igUserId) {
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "no_ig_business_account" },
    });
    return redirectTo(`${UI_PATH}?error=no_ig_business_account`, baseUrl);
  }
  const username = profile?.username || igUserId;

  // 5. Cifrar o token
  const encrypted = await encryptWebhookSecret(admin, longLived.accessToken);
  if (!encrypted) {
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "encryption_failed" },
    });
    return redirectTo(`${UI_PATH}?error=encryption_failed`, baseUrl);
  }

  // 6. Gravar em channel_sessions (ig_page_id fica null — não há Page).
  // O índice único é PARCIAL (WHERE ig_business_account_id IS NOT NULL AND
  // archived_at IS NULL), e `ON CONFLICT (cols)` não casa com índice parcial
  // (erro 42P10). Então fazemos UPDATE-depois-INSERT manual, que independe de
  // constraint — evita o falso "sucesso" de um UPDATE que afeta 0 linhas.
  const expiresAt = new Date(Date.now() + longLived.expiresIn * 1000).toISOString();

  const campos = {
    ig_access_token_encrypted: encrypted,
    ig_token_expires_at: expiresAt,
    display_name: `Instagram @${username}`,
    status: "connected",
    archived_at: null,
  };

  const { data: atualizadas, error: updateError } = await admin
    .from("channel_sessions")
    .update(campos)
    .eq("organization_id", state.orgId)
    .eq("provider", "instagram")
    .eq("ig_business_account_id", igUserId)
    .select("id");

  if (updateError) {
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "update_failed", error: updateError.message },
    });
    return redirectTo(`${UI_PATH}?error=save_failed`, baseUrl);
  }

  if (!atualizadas || atualizadas.length === 0) {
    // channel_sessions exige webhook_secret_encrypted NOT NULL. O fluxo OAuth do
    // IG não usa esse segredo (o webhook do IG verifica via ig_webhook_tokens +
    // app secret), mas a coluna é obrigatória — geramos um valor cifrado válido.
    const webhookSecretEnc = await encryptWebhookSecret(admin, randomBytes(24).toString("hex"));
    if (!webhookSecretEnc) {
      void audit({
        action: "instagram.oauth_failed",
        organizationId: state.orgId,
        metadata: { reason: "encryption_failed" },
      });
      return redirectTo(`${UI_PATH}?error=encryption_failed`, baseUrl);
    }

    const { error: insertError } = await admin.from("channel_sessions").insert({
      organization_id: state.orgId,
      provider: "instagram",
      ig_business_account_id: igUserId,
      ig_page_id: null,
      webhook_secret_encrypted: webhookSecretEnc,
      ...campos,
    });

    if (insertError) {
      void audit({
        action: "instagram.oauth_failed",
        organizationId: state.orgId,
        metadata: { reason: "insert_failed", error: insertError.message },
      });
      return redirectTo(`${UI_PATH}?error=save_failed`, baseUrl);
    }
  }

  void audit({
    action: "instagram.oauth_connected",
    organizationId: state.orgId,
    actorUserId: state.userId,
    metadata: {
      ig_business_account_id: igUserId,
      username,
    },
  });

  return redirectTo(`${UI_PATH}?ok=1&account=${encodeURIComponent(username)}`, baseUrl);
}

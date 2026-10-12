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
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { audit } from "@/lib/audit";
import {
  verifyIgOAuthState,
  exchangeIgCode,
  exchangeIgLongLivedToken,
  fetchIgBusinessAccounts,
  type IgOAuthConfig,
} from "@/lib/channels/instagram/oauth";

export const dynamic = "force-dynamic";

const UI_PATH = "/app/instagram/conectar";

function redirectTo(path: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.redirect(new URL(path, base));
}

function getOAuthConfig(): IgOAuthConfig | null {
  const appId = process.env.IG_APP_ID ?? process.env.META_APP_ID;
  const appSecret = process.env.IG_APP_SECRET ?? process.env.META_APP_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

  const config = getOAuthConfig();
  if (!config) {
    return redirectTo(`${UI_PATH}?error=not_configured`);
  }

  // 1. Validar state
  const state = verifyIgOAuthState(stateParam);
  if (!state) {
    void audit({
      action: "instagram.oauth_failed",
      metadata: { reason: "invalid_state" },
    });
    return redirectTo(`${UI_PATH}?error=invalid_state`);
  }

  if (!code) {
    // Usuário cancelou o OAuth no Facebook
    const errorReason = url.searchParams.get("error_reason") ?? "missing_code";
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: errorReason },
    });
    return redirectTo(`${UI_PATH}?error=${errorReason}`);
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
    return redirectTo(`${UI_PATH}?error=code_exchange_failed`);
  }

  // 3. Trocar por long-lived token (60 dias)
  const longLived = await exchangeIgLongLivedToken(config, shortLived.accessToken);
  if (!longLived) {
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "long_lived_exchange_failed" },
    });
    return redirectTo(`${UI_PATH}?error=long_lived_exchange_failed`);
  }

  // 4. Buscar Pages e contas IG Business
  const accounts = await fetchIgBusinessAccounts(longLived.accessToken);
  if (accounts.length === 0) {
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "no_ig_business_account" },
    });
    return redirectTo(`${UI_PATH}?error=no_ig_business_account`);
  }

  // Usar a primeira conta IG Business encontrada
  // (se houver múltiplas, uma tela futura pode listar para o usuário escolher)
  const account = accounts[0]!;

  // 5. Cifrar o token
  const encrypted = await encryptWebhookSecret(admin, longLived.accessToken);
  if (!encrypted) {
    void audit({
      action: "instagram.oauth_failed",
      organizationId: state.orgId,
      metadata: { reason: "encryption_failed" },
    });
    return redirectTo(`${UI_PATH}?error=encryption_failed`);
  }

  // 6. Upsert em channel_sessions
  const expiresAt = new Date(Date.now() + longLived.expiresIn * 1000).toISOString();

  const { error: upsertError } = await admin
    .from("channel_sessions")
    .upsert(
      {
        organization_id: state.orgId,
        provider: "instagram",
        ig_business_account_id: account.igBusinessAccountId,
        ig_page_id: account.pageId,
        ig_access_token_encrypted: encrypted,
        ig_token_expires_at: expiresAt,
        label: `Instagram @${account.pageName || account.igBusinessAccountId}`,
        status: "connected",
      },
      {
        onConflict: "organization_id,ig_business_account_id",
        ignoreDuplicates: false,
      },
    );

  if (upsertError) {
    // Se o unique index não tem ON CONFLICT exato, tentar INSERT + UPDATE
    if (upsertError.code === "42P10" || upsertError.code === "23505") {
      const { error: updateError } = await admin
        .from("channel_sessions")
        .update({
          ig_page_id: account.pageId,
          ig_access_token_encrypted: encrypted,
          ig_token_expires_at: expiresAt,
          label: `Instagram @${account.pageName || account.igBusinessAccountId}`,
          status: "connected",
          archived_at: null,
        })
        .eq("organization_id", state.orgId)
        .eq("ig_business_account_id", account.igBusinessAccountId);

      if (updateError) {
        void audit({
          action: "instagram.oauth_failed",
          organizationId: state.orgId,
          metadata: { reason: "update_failed", error: updateError.message },
        });
        return redirectTo(`${UI_PATH}?error=save_failed`);
      }
    } else {
      void audit({
        action: "instagram.oauth_failed",
        organizationId: state.orgId,
        metadata: { reason: "upsert_failed", error: upsertError.message },
      });
      return redirectTo(`${UI_PATH}?error=save_failed`);
    }
  }

  void audit({
    action: "instagram.oauth_connected",
    organizationId: state.orgId,
    actorUserId: state.userId,
    metadata: {
      ig_business_account_id: account.igBusinessAccountId,
      page_id: account.pageId,
      page_name: account.pageName,
    },
  });

  return redirectTo(`${UI_PATH}?ok=1&account=${encodeURIComponent(account.pageName)}`);
}

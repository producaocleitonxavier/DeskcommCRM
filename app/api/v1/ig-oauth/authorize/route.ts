/**
 * GET /api/v1/ig-oauth/authorize
 *
 * Gera a URL de autorização do Instagram Business OAuth e redireciona o browser.
 * Requer sessão autenticada (cookie) com role ≥ admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import {
  generateIgOAuthState,
  getIgAuthorizationUrl,
  type IgOAuthConfig,
} from "@/lib/channels/instagram/oauth";

export const dynamic = "force-dynamic";

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

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const config = getOAuthConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL("/app/instagram/conectar?error=not_configured", baseUrl),
    );
  }

  const authz = await requireRole("admin");
  if (!authz.ok) {
    return NextResponse.redirect(
      new URL("/app/instagram/conectar?error=unauthorized", baseUrl),
    );
  }

  const { user, org } = authz;
  const state = generateIgOAuthState(org.orgId, user.id);
  const authUrl = getIgAuthorizationUrl(config, state);

  void audit({
    action: "instagram.oauth_started",
    actorUserId: user.id,
    organizationId: org.orgId,
    metadata: { redirect_uri: config.redirectUri },
  });

  return NextResponse.redirect(authUrl);
}

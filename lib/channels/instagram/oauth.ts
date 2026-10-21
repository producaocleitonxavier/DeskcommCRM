/**
 * Instagram Business OAuth — geração de URL de autorização e troca de código.
 *
 * ── Fluxo ──────────────────────────────────────────────────────────────────────
 * 1. Usuário clica "Conectar Instagram" na UI
 * 2. API gera URL com `getIgAuthorizationUrl()` e redireciona
 * 3. Facebook redireciona de volta com `code` + `state`
 * 4. Callback troca código por short-lived token via `exchangeIgCode()`
 * 5. Short-lived token é trocado por long-lived token via `exchangeIgLongLivedToken()`
 * 6. Token é cifrado e gravado em `channel_sessions`
 *
 * ── Permissões solicitadas ────────────────────────────────────────────────────
 * - instagram_basic — perfil, mídia
 * - instagram_manage_comments — ler/responder comentários
 * - instagram_manage_messages — enviar DMs
 * - pages_show_list — lista de Pages vinculadas
 * - pages_read_engagement — ler engajamento da Page
 *
 * Ref: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/getting-started
 */

import { createHmac, randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";

const OAUTH_BASE = "https://www.facebook.com/v21.0/dialog/oauth";
const TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token";

const SCOPES = [
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_read_engagement",
].join(",");

export interface IgOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface IgOAuthState {
  orgId: string;
  userId: string;
  nonce: string;
  exp: number;
}

const STATE_SECRET = process.env.IG_OAUTH_STATE_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

/**
 * Gera o state HMAC-assinado para o OAuth redirect.
 */
export function generateIgOAuthState(orgId: string, userId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutos
  const payload = JSON.stringify({ orgId, userId, nonce, exp });
  const sig = createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

/**
 * Verifica e decodifica o state.
 */
export function verifyIgOAuthState(state: string | null): IgOAuthState | null {
  if (!state) return null;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      payload: string;
      sig: string;
    };
    const expected = createHmac("sha256", STATE_SECRET).update(decoded.payload).digest("hex");
    if (expected !== decoded.sig) return null;
    const parsed = JSON.parse(decoded.payload) as IgOAuthState;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Resolve a URL pública base EM RUNTIME.
 *
 * Não usar `NEXT_PUBLIC_APP_URL` para o redirect do OAuth: ela é inlinada em
 * tempo de build pelo Next (o Dockerfile assa `https://placeholder.invalid`),
 * então o valor real do `.env` em runtime é ignorado e o Facebook recebe um
 * redirect_uri inválido ("URL bloqueada").
 *
 * Ordem de precedência:
 *  1. `APP_PUBLIC_URL` — env de runtime (não-public), determinístico por install
 *  2. headers `x-forwarded-proto` + `x-forwarded-host`/`host` (preenchidos pelo
 *     proxy Traefik) — resolve sozinho para qualquer domínio de cliente
 *  3. `NEXT_PUBLIC_APP_URL` / localhost — último recurso (pode estar assado)
 */
export function resolvePublicBaseUrl(headers: Headers): string {
  const envUrl = process.env.APP_PUBLIC_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/+$/, "");

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const proto = headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  const fallback = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return fallback.replace(/\/+$/, "");
}

/**
 * URL de autorização do Facebook/Instagram OAuth.
 */
export function getIgAuthorizationUrl(config: IgOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: SCOPES,
    response_type: "code",
    state,
  });
  return `${OAUTH_BASE}?${params.toString()}`;
}

/**
 * Troca o authorization code por um short-lived token.
 */
export async function exchangeIgCode(
  config: IgOAuthConfig,
  code: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
        code,
      }),
    });

    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || !json.access_token) {
      logger.error("[ig-oauth] troca de código falhou", { status: res.status, json });
      return null;
    }

    return {
      accessToken: json.access_token as string,
      expiresIn: typeof json.expires_in === "number" ? json.expires_in : 3600,
    };
  } catch (err) {
    logger.error("[ig-oauth] fetch falhou ao trocar código", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Troca um short-lived token por um long-lived token (60 dias).
 */
export async function exchangeIgLongLivedToken(
  config: IgOAuthConfig,
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const res = await fetch(`${TOKEN_URL}?${params.toString()}`);
    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok || !json.access_token) {
      logger.error("[ig-oauth] troca por long-lived falhou", { status: res.status, json });
      return null;
    }

    return {
      accessToken: json.access_token as string,
      expiresIn: typeof json.expires_in === "number" ? json.expires_in : 5184000, // 60 dias
    };
  } catch (err) {
    logger.error("[ig-oauth] fetch falhou ao trocar long-lived", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Busca as Pages do Facebook que o token alcança, com as contas Instagram vinculadas.
 *
 * Retorna um array de { pageId, pageName, igBusinessAccountId }.
 */
export async function fetchIgBusinessAccounts(
  accessToken: string,
): Promise<Array<{ pageId: string; pageName: string; igBusinessAccountId: string }>> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`,
    );
    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok || !Array.isArray(json.data)) {
      logger.error("[ig-oauth] busca de pages falhou", { status: res.status, json });
      return [];
    }

    const results: Array<{ pageId: string; pageName: string; igBusinessAccountId: string }> = [];
    for (const page of json.data as Array<Record<string, unknown>>) {
      const igBiz = page.instagram_business_account as Record<string, unknown> | undefined;
      if (igBiz?.id) {
        results.push({
          pageId: page.id as string,
          pageName: (page.name as string) ?? "",
          igBusinessAccountId: igBiz.id as string,
        });
      }
    }

    return results;
  } catch (err) {
    logger.error("[ig-oauth] fetch falhou ao buscar pages", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

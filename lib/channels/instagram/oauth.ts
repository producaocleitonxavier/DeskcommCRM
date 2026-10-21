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

// ── API do Instagram com Instagram Login (Business Login) ────────────────────
// Endpoints PRÓPRIOS do Instagram — não são os do Facebook/Graph clássico.
// O authorize é em instagram.com; a troca de código é em api.instagram.com; o
// long-lived e as chamadas de dados são em graph.instagram.com. As credenciais
// (IG_APP_ID/IG_APP_SECRET) são as do app do Instagram, não as do app Facebook.
const OAUTH_BASE = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const IG_GRAPH = "https://graph.instagram.com";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
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
 *
 * No Instagram Login, a resposta traz `user_id` — o ID da conta Instagram
 * Business conectada, que é o que gravamos em `ig_business_account_id`.
 * O token aqui é de curta duração (~1h); troque por long-lived em seguida.
 */
export async function exchangeIgCode(
  config: IgOAuthConfig,
  code: string,
): Promise<{ accessToken: string; userId: string } | null> {
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
      userId: String(json.user_id ?? ""),
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
 *
 * Instagram Login: GET graph.instagram.com/access_token?grant_type=ig_exchange_token
 * (só client_secret + access_token; NÃO usa client_id nem fb_exchange_token).
 */
export async function exchangeIgLongLivedToken(
  config: IgOAuthConfig,
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const params = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: config.appSecret,
      access_token: shortLivedToken,
    });

    const res = await fetch(`${IG_GRAPH}/access_token?${params.toString()}`);
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
 * Busca o perfil da conta Instagram conectada (Instagram Login).
 *
 * Não há Pages do Facebook neste fluxo: a conta IG vem direto do token. Usamos
 * o `/me` da graph.instagram.com para pegar o `user_id` (confirma o da troca de
 * código) e o `username` (vira o rótulo amigável da conexão).
 */
export async function fetchIgProfile(
  accessToken: string,
  version = "v21.0",
): Promise<{ igUserId: string; username: string } | null> {
  try {
    const res = await fetch(
      `${IG_GRAPH}/${version}/me?fields=user_id,username&access_token=${accessToken}`,
    );
    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      logger.error("[ig-oauth] busca de perfil IG falhou", { status: res.status, json });
      return null;
    }

    const igUserId = String(json.user_id ?? json.id ?? "");
    const username = String(json.username ?? "");
    if (!igUserId) return null;

    return { igUserId, username };
  } catch (err) {
    logger.error("[ig-oauth] fetch falhou ao buscar perfil IG", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

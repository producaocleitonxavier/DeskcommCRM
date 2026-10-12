/**
 * Credenciais do canal Instagram Business — **por sessão**, não por instalação.
 *
 * Segue o MESMO padrão de `lib/channels/meta/credentials.ts`:
 * - Sessão-primeiro, env como fallback
 * - `organization_id` obrigatório em toda busca (multi-tenant)
 * - Token cifrado via `fn_encrypt_oauth`/`fn_decrypt_oauth`
 * - LANÇA em falha de consulta (a lição da issue #236 vale aqui igual)
 *
 * A diferença é que o identificador é `ig_business_account_id` em vez de
 * `meta_phone_number_id`, e o token é `ig_access_token_encrypted` em vez de
 * `meta_token_encrypted`. A Graph API é a mesma; a versão vem do mesmo
 * `lib/graph-version.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { graphVersion } from "@/lib/graph-version";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { graphBaseUrl } from "@/lib/channels/meta/graph-base";

export interface IgCredentials {
  /** Instagram Business Account ID */
  businessAccountId: string;
  /** Facebook Page ID vinculado */
  pageId: string | null;
  /** Access token decifrado */
  token: string;
  /** Versão da Graph API */
  graphVersion: string;
  /** De onde veio — diagnóstico, nunca payload. */
  source: "session" | "env";
}

/**
 * Chave da busca. `organizationId` NÃO é decoração: ver cabeçalho de
 * `lib/channels/meta/credentials.ts` para a justificativa completa.
 */
export interface IgCredsLookup {
  /** Resolvido de fonte confiável (sessão, token do webhook, JWT). */
  organizationId: string;
  /** `channel_sessions.ig_business_account_id` */
  businessAccountId: string;
}

/**
 * Base da Graph API para o Instagram — mesmo host que o WhatsApp Cloud.
 */
export function igGraphBase(): string {
  return graphBaseUrl();
}

/**
 * Credencial do ambiente (fallback). `null` quando não configurada.
 */
export function igCredsFromEnv(): IgCredentials | null {
  const businessAccountId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const pageId = process.env.IG_PAGE_ID ?? null;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!businessAccountId || !token) return null;
  return { businessAccountId, pageId, token, graphVersion: graphVersion(), source: "env" };
}

/**
 * Credencial da sessão desta ORGANIZAÇÃO que atende este `ig_business_account_id`.
 *
 * `null` = "esta sessão não tem token gravado" — o chamador cai no env.
 * LANÇA quando a consulta falha (a mesma regra da issue #236).
 */
export async function igCredsForSession(
  admin: SupabaseClient,
  lookup: IgCredsLookup,
): Promise<IgCredentials | null> {
  const { organizationId, businessAccountId } = lookup;
  if (!organizationId || !businessAccountId) return null;

  const base = () =>
    admin
      .from("channel_sessions")
      .select("ig_business_account_id, ig_page_id, ig_access_token_encrypted")
      .eq("organization_id", organizationId)
      .eq("ig_business_account_id", businessAccountId)
      .eq("provider", "instagram");

  const { data, error } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).maybeSingle(),
    () => base().maybeSingle(),
  );

  if (error) {
    throw new Error(
      `ig_creds_lookup_failed: ${error.code ?? "sem_codigo"} ${error.message ?? ""}`.trim(),
    );
  }

  const cifrado = data?.ig_access_token_encrypted;
  if (!data || !cifrado) return null;

  const token = await decryptWebhookSecret(admin, cifrado as unknown as string);
  if (!token) return null;

  return {
    businessAccountId: data.ig_business_account_id as string,
    pageId: (data.ig_page_id as string) ?? null,
    token,
    graphVersion: graphVersion(),
    source: "session",
  };
}

/**
 * Credencial em vigor: sessão primeiro, env como fallback.
 */
export async function resolveIgCreds(
  admin: SupabaseClient,
  lookup: IgCredsLookup,
): Promise<IgCredentials | null> {
  return (await igCredsForSession(admin, lookup)) ?? igCredsFromEnv();
}

/**
 * Busca a sessão de canal Instagram por `channel_session_id` e retorna credenciais.
 *
 * Útil quando o caller já tem o ID da sessão (ex.: payload do event_log) mas não
 * o `ig_business_account_id`. LANÇA em falha de consulta.
 */
export async function igCredsForChannelSessionId(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<IgCredentials | null> {
  if (!organizationId || !channelSessionId) return null;

  const { data, error } = await admin
    .from("channel_sessions")
    .select("ig_business_account_id, ig_page_id, ig_access_token_encrypted")
    .eq("id", channelSessionId)
    .eq("organization_id", organizationId)
    .eq("provider", "instagram")
    .maybeSingle();

  if (error) {
    throw new Error(
      `ig_creds_session_lookup_failed: ${error.code ?? "sem_codigo"} ${error.message ?? ""}`.trim(),
    );
  }

  if (!data?.ig_access_token_encrypted) return null;

  const token = await decryptWebhookSecret(admin, data.ig_access_token_encrypted as unknown as string);
  if (!token) return null;

  return {
    businessAccountId: data.ig_business_account_id as string,
    pageId: (data.ig_page_id as string) ?? null,
    token,
    graphVersion: graphVersion(),
    source: "session",
  };
}

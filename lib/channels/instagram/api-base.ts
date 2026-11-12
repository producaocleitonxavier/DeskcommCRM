/**
 * QUAL API do Instagram esta conexão fala — decidido pela própria credencial.
 *
 * Existem dois jeitos de conectar uma conta, e cada um tem host e remetente
 * próprios:
 *
 *  1. **Login do Instagram** (o que o OAuth desta casa faz — `ig-oauth/callback`
 *     grava `ig_page_id = null`): o token só vale em `graph.instagram.com`, e quem
 *     envia é a própria conta (`/{ig_user_id}/messages`). Não há Página.
 *  2. **Login do Facebook com Página vinculada** (credencial de ambiente legada,
 *     com `IG_PAGE_ID`): fala com a Graph do Facebook e envia pela Página
 *     (`/{page_id}/messages`).
 *
 * O defeito que isto conserta: `send-dm.ts` exigia Página e falava sempre com a
 * Graph do Facebook. Toda conta conectada pelo fluxo (1) recebia
 * `ig_page_id_ausente` e nenhuma DM saía — o funil seguidor → conversa → WhatsApp
 * morria no primeiro passo de saída.
 *
 * Ref: developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
 */
import { graphBaseUrl } from "@/lib/channels/meta/graph-base";

import type { IgCredentials } from "./credentials";

/** Host da API do Instagram com Login do Instagram (o mesmo de `oauth.ts`/`perfil.ts`). */
const IG_LOGIN_GRAPH = "https://graph.instagram.com";

/** A conexão é por Login do Instagram (sem Página do Facebook)? */
export function ehLoginDoInstagram(creds: Pick<IgCredentials, "pageId">): boolean {
  return !creds.pageId;
}

/** Base (host + versão) da API que ESTA credencial fala. */
export function igApiBase(creds: Pick<IgCredentials, "pageId" | "graphVersion">): string {
  return ehLoginDoInstagram(creds) ? `${IG_LOGIN_GRAPH}/${creds.graphVersion}` : graphBaseUrl(creds.graphVersion);
}

/** Quem envia a mensagem: a Página (login do Facebook) ou a própria conta (login do Instagram). */
export function igRemetenteId(creds: Pick<IgCredentials, "pageId" | "businessAccountId">): string {
  return creds.pageId || creds.businessAccountId;
}

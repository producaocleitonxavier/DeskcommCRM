/**
 * Busca perfil de usuário do Instagram via Graph API.
 *
 * Usado quando um novo seguidor interage (comentário, DM) e precisamos
 * dos dados do perfil para criar/atualizar o contato no CRM.
 *
 * Endpoint: GET /{ig_user_id}?fields=id,username,name,profile_picture_url,follower_count,is_verified_user
 * Ref: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
 */

import { logger } from "@/lib/logger";
import type { IgCredentials } from "./credentials";

const GRAPH_BASE = "https://graph.facebook.com";

export interface IgUserProfile {
  /** ID do usuário no Instagram (IGSID) */
  igUserId: string;
  /** Username (sem @) */
  username: string | null;
  /** Nome de exibição */
  name: string | null;
  /** URL da foto de perfil (temporária — expira) */
  profilePictureUrl: string | null;
  /** Número de seguidores */
  followerCount: number | null;
  /** Se o perfil é verificado */
  isVerified: boolean;
}

/**
 * Busca o perfil de um usuário do Instagram pelo ID.
 *
 * @param creds - Credenciais do canal Instagram (com token e versão do Graph)
 * @param igUserId - ID do usuário no Instagram (IGSID)
 * @returns Perfil ou null se a requisição falhar
 */
export async function buscarPerfilInstagram(
  creds: IgCredentials,
  igUserId: string,
): Promise<IgUserProfile | null> {
  const fields = [
    "id",
    "username",
    "name",
    "profile_picture_url",
    "follower_count",
    "is_verified_user",
  ].join(",");

  const url = `${GRAPH_BASE}/${creds.graphVersion}/${igUserId}?fields=${fields}&access_token=${creds.token}`;

  try {
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      logger.warn("[ig-profile] Graph API error", {
        status: res.status,
        igUserId,
        body: body.slice(0, 500),
      });
      return null;
    }

    const data = await res.json();

    return {
      igUserId: data.id ?? igUserId,
      username: data.username ?? null,
      name: data.name ?? null,
      profilePictureUrl: data.profile_picture_url ?? null,
      followerCount: typeof data.follower_count === "number" ? data.follower_count : null,
      isVerified: data.is_verified_user === true,
    };
  } catch (err) {
    logger.error("[ig-profile] fetch error", { igUserId, error: err });
    return null;
  }
}

/**
 * Busca perfis de múltiplos usuários em batch.
 * Usa Promise.allSettled para não deixar uma falha derrubar as outras.
 */
export async function buscarPerfisEmLote(
  creds: IgCredentials,
  igUserIds: string[],
): Promise<Map<string, IgUserProfile>> {
  const results = await Promise.allSettled(
    igUserIds.map((id) => buscarPerfilInstagram(creds, id)),
  );

  const map = new Map<string, IgUserProfile>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "fulfilled" && r.value) {
      map.set(igUserIds[i]!, r.value);
    }
  }

  return map;
}

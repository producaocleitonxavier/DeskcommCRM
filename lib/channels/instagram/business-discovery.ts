/**
 * Instagram Graph API — business_discovery. Lê o perfil PÚBLICO de uma conta
 * Business/Creator pelo @username (ex.: um adversário), usando a conexão IG da
 * própria organização. É oficial e gratuito — não é scraper. Só funciona para
 * contas Business/Creator públicas.
 *
 * GET /{meu_ig_business_account_id}
 *   ?fields=business_discovery.username(ALVO){followers_count,media_count,
 *            media.limit(12){like_count,comments_count,timestamp,media_type,permalink}}
 */

import type { IgCredentials } from "@/lib/channels/instagram/credentials";

const GRAPH_BASE = "https://graph.facebook.com";

export interface PerfilConcorrente {
  username: string;
  followers: number;
  posts: number;
  /** engajamento médio dos posts recentes: (curtidas+comentários)/seguidores, em %. */
  engajamento: number;
  midias: { likes: number; comments: number; timestamp: string | null; permalink: string | null; tipo: string | null }[];
}

export async function businessDiscovery(creds: IgCredentials, handle: string): Promise<PerfilConcorrente | null> {
  const alvo = handle.trim().replace(/^@+/, "");
  if (!alvo) return null;
  const inner = "followers_count,media_count,media.limit(12){like_count,comments_count,timestamp,media_type,permalink}";
  const fields = `business_discovery.username(${alvo}){${inner}}`;
  const url = `${GRAPH_BASE}/${creds.graphVersion}/${creds.businessAccountId}?fields=${encodeURIComponent(fields)}&access_token=${creds.token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null; // conta não-business, privada, ou handle inexistente
    const data = (await res.json()) as { business_discovery?: { followers_count?: number; media_count?: number; media?: { data?: { like_count?: number; comments_count?: number; timestamp?: string; media_type?: string; permalink?: string }[] } } };
    const bd = data.business_discovery;
    if (!bd) return null;
    const followers = Number(bd.followers_count ?? 0);
    const midias = (bd.media?.data ?? []).map((m) => ({
      likes: Number(m.like_count ?? 0), comments: Number(m.comments_count ?? 0),
      timestamp: m.timestamp ?? null, permalink: m.permalink ?? null, tipo: m.media_type ?? null,
    }));
    const engajamento = followers > 0 && midias.length > 0
      ? (midias.reduce((s, m) => s + m.likes + m.comments, 0) / midias.length / followers) * 100
      : 0;
    return { username: alvo, followers, posts: Number(bd.media_count ?? 0), engajamento: Math.round(engajamento * 100) / 100, midias };
  } catch {
    return null;
  }
}

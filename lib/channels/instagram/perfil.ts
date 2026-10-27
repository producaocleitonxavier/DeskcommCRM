/**
 * Leitura da PRÓPRIA conta Instagram conectada (API com Instagram Login).
 *
 * Diferente do business_discovery (que lê terceiros e NÃO existe nesta API),
 * aqui lemos a conta do próprio cliente via graph.instagram.com /me:
 * perfil (seguidores, nº de posts, tipo) + mídias recentes com engajamento.
 *
 * Usado pela tela "Minha Performance". Gratuito e oficial.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveIgCreds } from "@/lib/channels/instagram/credentials";

const IG_GRAPH = "https://graph.instagram.com";

export interface MidiaPropria {
  id: string;
  tipo: string | null;
  legenda: string | null;
  permalink: string | null;
  thumb: string | null;
  timestamp: string | null;
  likes: number;
  comentarios: number;
}

export interface PerfilProprio {
  username: string;
  nome: string | null;
  tipoConta: string | null;
  fotoPerfil: string | null;
  seguidores: number;
  seguindo: number;
  posts: number;
  /** engajamento médio dos posts recentes: (curtidas+comentários)/seguidores, em %. */
  engajamento: number;
  midias: MidiaPropria[];
}

/** Resolve o token/versão da conta IG conectada da org (ou null). Interno. */
async function resolverContaIg(
  organizationId: string,
): Promise<{ v: string; tok: string } | null> {
  const admin = createAdminClient();
  const { data: sessao } = await admin
    .from("channel_sessions")
    .select("ig_business_account_id")
    .eq("organization_id", organizationId)
    .eq("provider", "instagram")
    .not("ig_business_account_id", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const baid = (sessao as { ig_business_account_id?: string } | null)?.ig_business_account_id;
  if (!baid) return null;

  const creds = await resolveIgCreds(admin, { organizationId, businessAccountId: baid });
  if (!creds) return null;
  return { v: creds.graphVersion, tok: creds.token };
}

/** Mapeia uma mídia bruta da Graph API para `MidiaPropria`. */
function mapMidia(m: Record<string, unknown>): MidiaPropria {
  return {
    id: String(m.id ?? ""),
    tipo: (m.media_type as string) ?? null,
    legenda: (m.caption as string) ?? null,
    permalink: (m.permalink as string) ?? null,
    // vídeos trazem thumbnail_url; imagens trazem media_url.
    thumb: (m.thumbnail_url as string) ?? (m.media_url as string) ?? null,
    timestamp: (m.timestamp as string) ?? null,
    likes: Number(m.like_count ?? 0),
    comentarios: Number(m.comments_count ?? 0),
  };
}

/**
 * Lista só as mídias recentes da conta conectada — para o SELETOR DE VÍDEOS da
 * automação (o cliente clica em quais posts terão captação). `id` = media_id, o
 * mesmo que o webhook de comentário manda, então casa exato no motor.
 * `null` = Instagram não conectado (ou token inválido/expirado).
 */
export async function listarMidiasDaConta(
  organizationId: string,
  limit = 24,
): Promise<MidiaPropria[] | null> {
  const conta = await resolverContaIg(organizationId);
  if (!conta) return null;
  try {
    const res = await fetch(
      `${IG_GRAPH}/${conta.v}/me/media?fields=id,caption,media_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=${limit}&access_token=${conta.tok}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    return (json.data ?? []).map(mapMidia);
  } catch {
    return null;
  }
}

/**
 * Lê o perfil + mídias recentes da conta Instagram conectada da organização.
 * `null` = Instagram não conectado (ou token inválido/expirado).
 */
export async function lerPerfilInstagram(organizationId: string): Promise<PerfilProprio | null> {
  const conta = await resolverContaIg(organizationId);
  if (!conta) return null;

  const v = conta.v;
  const tok = conta.tok;

  try {
    const perfilRes = await fetch(
      `${IG_GRAPH}/${v}/me?fields=username,name,account_type,followers_count,follows_count,media_count,profile_picture_url&access_token=${tok}`,
    );
    if (!perfilRes.ok) return null;
    const p = (await perfilRes.json()) as Record<string, unknown>;

    const midiasRes = await fetch(
      `${IG_GRAPH}/${v}/me/media?fields=id,caption,media_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=12&access_token=${tok}`,
    );
    const midiasJson = midiasRes.ok
      ? ((await midiasRes.json()) as { data?: Array<Record<string, unknown>> })
      : { data: [] };

    const midias: MidiaPropria[] = (midiasJson.data ?? []).map((m) => ({
      id: String(m.id ?? ""),
      tipo: (m.media_type as string) ?? null,
      legenda: (m.caption as string) ?? null,
      permalink: (m.permalink as string) ?? null,
      // vídeos trazem thumbnail_url; imagens trazem media_url.
      thumb: (m.thumbnail_url as string) ?? (m.media_url as string) ?? null,
      timestamp: (m.timestamp as string) ?? null,
      likes: Number(m.like_count ?? 0),
      comentarios: Number(m.comments_count ?? 0),
    }));

    const seguidores = Number(p.followers_count ?? 0);
    const engajamento =
      seguidores > 0 && midias.length > 0
        ? (midias.reduce((s, m) => s + m.likes + m.comentarios, 0) / midias.length / seguidores) * 100
        : 0;

    return {
      username: String(p.username ?? ""),
      nome: (p.name as string) ?? null,
      tipoConta: (p.account_type as string) ?? null,
      fotoPerfil: (p.profile_picture_url as string) ?? null,
      seguidores,
      seguindo: Number(p.follows_count ?? 0),
      posts: Number(p.media_count ?? 0),
      engajamento: Math.round(engajamento * 100) / 100,
      midias,
    };
  } catch {
    return null;
  }
}

/**
 * /app/politico/social — Monitoramento Social (War Room 2.0)
 *
 * Server: auth + fetch (pol_social_profiles, pol_social_posts, métricas).
 * Visual em ./_social-client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import SocialClient, { type PerfilItem, type PostItem } from "./_social-client";

export const dynamic = "force-dynamic";

const PLATAFORMA_COR: Record<string, string> = {
  instagram: "#E1306C",
  facebook: "#1877F2",
  twitter: "#1DA1F2",
  tiktok: "#111111",
  youtube: "#FF0000",
  linkedin: "#0A66C2",
};

export default async function SocialHubPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  const [totalPerfis, influenciadores, postsColetados, alertas, perfisRes, postsRes] = await Promise.all([
    db.from("pol_social_profiles").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId),
    db.from("pol_social_profiles").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("category", "influencer"),
    db.from("pol_social_posts").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId),
    db.from("pol_social_intelligence").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId),
    db
      .from("pol_social_profiles")
      .select("id, username, display_name, platform, followers, engagement_rate, category, active")
      .eq("organization_id", org.orgId)
      .order("followers", { ascending: false })
      .limit(60),
    db
      .from("pol_social_posts")
      .select("id, platform, caption, likes, comments, posted_at")
      .eq("organization_id", org.orgId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(8),
  ]);

  const perfisRaw = (perfisRes.data ?? []) as Record<string, unknown>[];
  const perfis: PerfilItem[] = perfisRaw.map((p) => ({
    id: String(p.id),
    username: String(p.username ?? ""),
    displayName: (p.display_name as string | null) ?? null,
    platform: String(p.platform ?? ""),
    followers: Number(p.followers ?? 0),
    engagementRate: Number(p.engagement_rate ?? 0),
    category: String(p.category ?? "monitorado"),
    active: Boolean(p.active),
  }));

  // Engajamento médio por plataforma.
  const porPlat = new Map<string, { soma: number; n: number }>();
  for (const p of perfis) {
    const cur = porPlat.get(p.platform) ?? { soma: 0, n: 0 };
    cur.soma += p.engagementRate;
    cur.n += 1;
    porPlat.set(p.platform, cur);
  }
  const engajamentoPorPlataforma = [...porPlat.entries()]
    .map(([name, { soma, n }]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: Math.round((soma / n) * 100) / 100,
      fill: PLATAFORMA_COR[name] ?? "#4352C4",
    }))
    .sort((a, b) => b.value - a.value);

  const posts: PostItem[] = ((postsRes.data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    platform: String(p.platform ?? ""),
    caption: (p.caption as string | null) ?? null,
    likes: Number(p.likes ?? 0),
    comments: Number(p.comments ?? 0),
    postedAt: (p.posted_at as string | null) ?? null,
  }));

  return (
    <SocialClient
      kpis={{
        totalPerfis: totalPerfis.count ?? 0,
        influenciadores: influenciadores.count ?? 0,
        postsColetados: postsColetados.count ?? 0,
        alertas: alertas.count ?? 0,
      }}
      engajamentoPorPlataforma={engajamentoPorPlataforma}
      perfis={perfis}
      posts={posts}
    />
  );
}

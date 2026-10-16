/**
 * /app/politico/motor-viral — Motor Viral (War Room 2.0)
 *
 * Server: auth + fetch (pol_generated_content). Visual em ./_motor-viral-client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import MotorViralClient, { type ConteudoItem } from "./_motor-viral-client";

export const dynamic = "force-dynamic";

const POR_PAGINA = 12;

const CONTENT_TYPE_LABELS: Record<string, string> = {
  video_script: "Roteiro de vídeo",
  caption: "Legenda",
  carousel: "Carrossel",
  story: "Story",
  reel_script: "Roteiro de Reel",
  live_script: "Roteiro de Live",
  article: "Artigo",
  thread: "Thread",
  other: "Outro",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "Twitter",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  cross_platform: "Multiplataforma",
};

export default async function MotorViralPage(props: { searchParams: Promise<{ pagina?: string }> }) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const sp = await props.searchParams;
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);
  const offset = (pagina - 1) * POR_PAGINA;
  const db = await createClient();

  const [totalRes, iaRes, viralRes, lista, datasRes] = await Promise.all([
    db.from("pol_generated_content").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId),
    db.from("pol_generated_content").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).in("generation_source", ["ai_auto", "ai_assisted"]),
    db.from("pol_generated_content").select("viral_score").eq("organization_id", org.orgId).not("viral_score", "is", null),
    db
      .from("pol_generated_content")
      .select("id, title, topic, content_type, platform, viral_score, quality_score, generation_source, created_at", { count: "exact" })
      .eq("organization_id", org.orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + POR_PAGINA - 1),
    db.from("pol_generated_content").select("created_at").eq("organization_id", org.orgId).limit(1000),
  ]);

  const scores = (viralRes.data ?? []) as { viral_score: number }[];
  const scoreViralMedio = scores.length > 0 ? Math.round((scores.reduce((a, r) => a + Number(r.viral_score), 0) / scores.length) * 10) / 10 : 0;

  // Série semanal (últimas 8 semanas) de conteúdos criados.
  const agora = new Date();
  const serieSemanal: { name: string; value: number }[] = [];
  const datas = ((datasRes.data ?? []) as { created_at: string }[]).map((d) => new Date(d.created_at).getTime());
  for (let i = 7; i >= 0; i--) {
    const fim = new Date(agora);
    fim.setDate(agora.getDate() - i * 7);
    fim.setHours(23, 59, 59, 999);
    const ini = new Date(fim);
    ini.setDate(fim.getDate() - 6);
    ini.setHours(0, 0, 0, 0);
    const value = datas.filter((t) => t >= ini.getTime() && t <= fim.getTime()).length;
    serieSemanal.push({ name: ini.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), value });
  }

  const conteudos: ConteudoItem[] = ((lista.data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    title: String(c.title ?? ""),
    topic: String(c.topic ?? ""),
    tipo: CONTENT_TYPE_LABELS[String(c.content_type)] ?? String(c.content_type),
    plataforma: c.platform ? (PLATFORM_LABELS[String(c.platform)] ?? String(c.platform)) : null,
    viralScore: c.viral_score as number | null,
    qualityScore: c.quality_score as number | null,
    fonte: String(c.generation_source ?? "manual"),
    createdAt: String(c.created_at),
  }));

  const total = lista.count ?? 0;

  return (
    <MotorViralClient
      kpis={{ totalConteudos: totalRes.count ?? 0, geradosPorIA: iaRes.count ?? 0, scoreViralMedio }}
      serieSemanal={serieSemanal}
      conteudos={conteudos}
      pagina={pagina}
      totalPaginas={Math.ceil(total / POR_PAGINA)}
    />
  );
}

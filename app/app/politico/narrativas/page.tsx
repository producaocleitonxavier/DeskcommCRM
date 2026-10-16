/**
 * /app/politico/narrativas — Radar de Narrativas (War Room 2.0)
 *
 * Server: auth + fetch (pol_narratives, pol_narrative_signals). Visual em
 * ./_narrativas-client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NarrativasClient, { type NarrativaItem } from "./_narrativas-client";

export const dynamic = "force-dynamic";

const SENTIMENTO_COR: Record<string, string> = {
  positive: "#17784F",
  negative: "#A3302A",
  neutral: "#9A9D8F",
  mixed: "#8A5A10",
};
const SENTIMENTO_LABEL: Record<string, string> = {
  positive: "Positivo",
  negative: "Negativo",
  neutral: "Neutro",
  mixed: "Misto",
};

export default async function NarrativasPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

  const [total, oportunidades, ameacas, sinaisRecentes, lista] = await Promise.all([
    db.from("pol_narratives").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId),
    db.from("pol_narratives").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("strategic_status", "opportunity"),
    db.from("pol_narratives").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).in("strategic_status", ["threat", "crisis"]),
    db.from("pol_narrative_signals").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).gte("created_at", seteDiasAtras.toISOString()),
    db
      .from("pol_narratives")
      .select("id, theme, platform, sentiment, strength, posts_count, strategic_status")
      .eq("organization_id", org.orgId)
      .order("strength", { ascending: false })
      .limit(40),
  ]);

  const narrativas: NarrativaItem[] = ((lista.data ?? []) as Record<string, unknown>[]).map((n) => ({
    id: String(n.id),
    theme: String(n.theme ?? ""),
    platform: (n.platform as string | null) ?? null,
    sentiment: (n.sentiment as string | null) ?? null,
    strength: Number(n.strength ?? 0),
    postsCount: Number(n.posts_count ?? 0),
    status: (n.strategic_status as string | null) ?? null,
  }));

  // Distribuição de sentimento (pie) a partir das narrativas carregadas.
  const porSent = new Map<string, number>();
  for (const n of narrativas) {
    const s = n.sentiment ?? "neutral";
    porSent.set(s, (porSent.get(s) ?? 0) + 1);
  }
  const sentimentoPie = [...porSent.entries()].map(([s, value]) => ({
    name: SENTIMENTO_LABEL[s] ?? s,
    value,
    fill: SENTIMENTO_COR[s] ?? "#9A9D8F",
  }));

  return (
    <NarrativasClient
      kpis={{
        total: total.count ?? 0,
        oportunidades: oportunidades.count ?? 0,
        ameacas: ameacas.count ?? 0,
        sinaisRecentes: sinaisRecentes.count ?? 0,
      }}
      sentimentoPie={sentimentoPie}
      narrativas={narrativas}
    />
  );
}

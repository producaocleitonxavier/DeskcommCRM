/**
 * /app/politico/adversarios — Painel de Adversários (War Room 2.0)
 *
 * Server: auth + fetch (pol_opponents, pol_opponent_signals). Visual em
 * ./_adversarios-client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import AdversariosClient, { type AdversarioItem } from "./_adversarios-client";
import AdversariosGestao from "./_adversarios-gestao";
import MonitoramentoTabs from "@/components/politico/monitoramento-tabs";
import { listarSinaisAdversarios } from "@/app/actions/politico/adversarios";

export const dynamic = "force-dynamic";

const RISCO_COR: Record<string, string> = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#FB923C",
  critical: "#EF4444",
};

export default async function AdversariosPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const db = await createClient();
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

  const [total, riscoAlto, sinaisAtivos, lista] = await Promise.all([
    db.from("pol_opponents").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId),
    db.from("pol_opponents").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).in("risk_level", ["high", "critical"]),
    db.from("pol_opponent_signals").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).gte("created_at", seteDiasAtras.toISOString()),
    db
      .from("pol_opponents")
      .select("id, name, platform, username, risk_level, threat_score, followers, active")
      .eq("organization_id", org.orgId)
      .order("threat_score", { ascending: false })
      .limit(60),
  ]);

  const adversarios: AdversarioItem[] = ((lista.data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id),
    name: String(a.name ?? ""),
    platform: String(a.platform ?? ""),
    username: (a.username as string | null) ?? null,
    riskLevel: String(a.risk_level ?? "low"),
    threatScore: Number(a.threat_score ?? 0),
    followers: Number(a.followers ?? 0),
    active: Boolean(a.active),
  }));

  const comparativo = adversarios
    .slice(0, 8)
    .map((a) => ({ name: a.name, value: Math.round(a.threatScore * 10) / 10, fill: RISCO_COR[a.riskLevel] ?? "#4352C4" }));

  const sinais = await listarSinaisAdversarios(30);

  return (
    <>
      <MonitoramentoTabs active="adversarios" />
      <AdversariosGestao
        adversarios={adversarios.map((a) => ({ id: a.id, name: a.name, username: a.username, threatScore: a.threatScore, riskLevel: a.riskLevel }))}
        sinais={sinais}
      />
      <AdversariosClient
        kpis={{ total: total.count ?? 0, riscoAlto: riscoAlto.count ?? 0, sinaisAtivos: sinaisAtivos.count ?? 0 }}
        comparativo={comparativo}
        adversarios={adversarios}
      />
    </>
  );
}

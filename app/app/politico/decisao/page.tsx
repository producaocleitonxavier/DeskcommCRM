/**
 * /app/politico/decisao — Decision Engine (War Room 2.0)
 *
 * Server: auth + fetch (pol_decision_signals, pol_alerts). Visual em
 * ./_decisao-client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import DecisaoClient, { type AlertaItem, type SinalItem } from "./_decisao-client";
import MonitoramentoTabs from "@/components/politico/monitoramento-tabs";

export const dynamic = "force-dynamic";

export default async function DecisaoPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  const [sinaisRes, alertasRes] = await Promise.all([
    db
      .from("pol_decision_signals")
      .select("id, signal_type, severity, data, processed_at, created_at")
      .eq("organization_id", org.orgId)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("pol_alerts")
      .select("id, title, alert_type, severity, status, created_at")
      .eq("organization_id", org.orgId)
      .in("status", ["open", "acknowledged", "investigating"])
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const sinais: SinalItem[] = ((sinaisRes.data ?? []) as Record<string, unknown>[]).map((s) => {
    const d = (s.data ?? {}) as { title?: string; descricao?: string; acao?: string };
    return {
      id: String(s.id),
      title: d.title ?? String(s.signal_type ?? "Sinal"),
      description: d.descricao ?? null,
      signalType: String(s.signal_type ?? ""),
      severity: String(s.severity ?? "medium"),
      status: s.processed_at ? "resolved" : "pending",
      recommendedAction: d.acao ?? null,
      createdAt: String(s.created_at),
    };
  });

  const alertas: AlertaItem[] = ((alertasRes.data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: String(a.id),
    title: String(a.title ?? ""),
    alertType: (a.alert_type as string | null) ?? null,
    severity: String(a.severity ?? "medium"),
    createdAt: String(a.created_at),
  }));

  const pendentes = sinais.filter((s) => s.status === "pending").length;
  const criticos = sinais.filter((s) => ["high", "critical"].includes(s.severity)).length;

  return (
    <>
      <MonitoramentoTabs active="decisao" />
      <DecisaoClient
        kpis={{ total: sinais.length, pendentes, criticos, alertas: alertas.length }}
        sinais={sinais}
        alertas={alertas}
      />
    </>
  );
}

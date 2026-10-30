/**
 * /app/politico/alertas — Central de Alertas (War Room 2.0)
 *
 * Server component: auth + fetch (pol_alerts). O visual (filtros, cards,
 * ação de resolver) vive em ./_alertas-client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import AlertasClient from "./_alertas-client";
import MonitoramentoTabs from "@/components/politico/monitoramento-tabs";

export const dynamic = "force-dynamic";

export interface Alerta {
  id: string;
  title: string;
  alert_type: string | null;
  severity: string;
  status: string;
  description: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

const STATUS_ATIVOS = ["open", "acknowledged", "investigating"];

async function buscarAlertas(
  organizationId: string,
  filtroStatus?: string,
  filtroSeverity?: string,
  filtroTipo?: string,
): Promise<Alerta[]> {
  const db = await createClient();

  let query = db
    .from("pol_alerts")
    .select("id, title, alert_type, severity, status, description, acknowledged_by, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filtroStatus) query = query.eq("status", filtroStatus);
  if (filtroSeverity) query = query.eq("severity", filtroSeverity);
  if (filtroTipo) query = query.eq("alert_type", filtroTipo);

  const { data, error } = await query;
  if (error) {
    console.error("Erro ao buscar alertas:", error.message);
    return [];
  }
  return (data ?? []) as Alerta[];
}

async function contarCriticos(organizationId: string): Promise<number> {
  const db = await createClient();
  const { count } = await db
    .from("pol_alerts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("severity", "critical")
    .in("status", STATUS_ATIVOS);
  return count ?? 0;
}

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; tipo?: string }>;
}) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const params = await searchParams;
  const filtros = {
    status: params.status ?? "",
    severity: params.severity ?? "",
    tipo: params.tipo ?? "",
  };

  const [alertas, criticosAtivos] = await Promise.all([
    buscarAlertas(org.orgId, filtros.status || undefined, filtros.severity || undefined, filtros.tipo || undefined),
    contarCriticos(org.orgId),
  ]);

  return (
    <>
      <MonitoramentoTabs active="alertas" />
      <AlertasClient alertas={alertas} filtros={filtros} criticosAtivos={criticosAtivos} />
    </>
  );
}

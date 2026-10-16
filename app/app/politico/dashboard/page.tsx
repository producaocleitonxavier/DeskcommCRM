/**
 * /app/politico/dashboard — Dashboard gerencial War Room (Fase 4)
 *
 * Server component: auth + fetch das 3 views (pol_vw_warroom_dashboard,
 * pol_vw_funil_kpis, pol_vw_call_queue_status). O corpo visual com gráficos
 * (Recharts) vive em ./_dashboard-client, porque os componentes de
 * components/politico/ recebem ícones LucideIcon como prop.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import DashboardClient from "./_dashboard-client";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

export interface DashboardData {
  organization_id: string;
  total_leads: number;
  votos_certos: number;
  militantes: number;
  apoiadores: number;
  simpatizantes: number;
  novos_cadastros: number;
  leads_quentes: number;
  leads_mornos: number;
  leads_frios: number;
  lideres_potenciais: number;
  total_eventos: number;
  eventos_proximos: number;
  alertas_ativos: number;
  alertas_criticos: number;
  pesquisas_ativas: number;
  perfis_monitorados: number;
  adversarios_ativos: number;
  ligacoes_pendentes: number;
}

export interface FunilKpis {
  funil_total: number;
  funil_novo_cadastro: number;
  funil_simpatizante: number;
  funil_apoiador: number;
  funil_militante: number;
  funil_voto_certo: number;
  taxa_ativacao_pct: number;
  taxa_conversao_pct: number;
  invisivel_total: number;
  invisivel_awareness: number;
  invisivel_interest: number;
  invisivel_consideration: number;
  invisivel_intent: number;
  invisivel_evaluation: number;
  invisivel_conversion: number;
}

export interface CallQueueStatus {
  total_chamadas: number;
  pendentes: number;
  completadas: number;
  sem_resposta: number;
  apoio_confirmado: number;
  indeciso: number;
  recusa: number;
  taxa_sucesso_pct: number;
  media_tentativas: number;
}

// -- Data fetching -----------------------------------------------------------

async function buscarDashboard(organizationId: string) {
  const db = await createClient();

  const [dashRes, funilRes, callRes] = await Promise.all([
    db
      .from("pol_vw_warroom_dashboard")
      .select("*")
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle(),

    db
      .from("pol_vw_funil_kpis")
      .select("*")
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle(),

    db
      .from("pol_vw_call_queue_status")
      .select("*")
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (dashRes.error) console.error("Erro dashboard:", dashRes.error.message);
  if (funilRes.error) console.error("Erro funil:", funilRes.error.message);
  if (callRes.error) console.error("Erro call queue:", callRes.error.message);

  return {
    dash: (dashRes.data ?? null) as DashboardData | null,
    funil: (funilRes.data ?? null) as FunilKpis | null,
    calls: (callRes.data ?? null) as CallQueueStatus | null,
  };
}

// -- Componente (server) -----------------------------------------------------

export default async function DashboardPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const { dash, funil, calls } = await buscarDashboard(org.orgId);

  return <DashboardClient dash={dash} funil={funil} calls={calls} />;
}

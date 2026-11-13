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
import { ROLE_RANK } from "@/lib/auth/types";
import DashboardClient from "./_dashboard-client";
import {
  calcularMetricasDeAtendimento,
  type MensagemParaMetricas,
  type MetricasDeAtendimento,
} from "@/lib/politico/atendimento-metricas";


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

/**
 * Mensagens dos últimos 30 dias para os números de atendimento. Só 4 colunas,
 * paginado de 1000 em 1000 (o PostgREST corta em 1000 por pedido) até um teto
 * de 10 mil — o suficiente para a leitura do mês sem pesar a tela.
 */
const JANELA_ATENDIMENTO_DIAS = 30;
async function buscarAtendimento(organizationId: string): Promise<MetricasDeAtendimento> {
  const db = await createClient();
  const desde = new Date(Date.now() - JANELA_ATENDIMENTO_DIAS * 24 * 60 * 60 * 1000).toISOString();
  const todas: MensagemParaMetricas[] = [];
  for (let pagina = 0; pagina < 10; pagina++) {
    const { data, error } = await db
      .from("messages")
      .select("conversation_id, direction, created_at, sent_by_user_id")
      .eq("organization_id", organizationId)
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error || !data || data.length === 0) break;
    todas.push(...(data as MensagemParaMetricas[]));
    if (data.length < 1000) break;
  }
  return calcularMetricasDeAtendimento(todas);
}

// -- Componente (server) -----------------------------------------------------

export default async function DashboardPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  // Painel gerencial = gerente+. Assessor (agent) cai no Hoje. Trava REAL de
  // papel — o menu/aba escondidos são só apresentação; a rota precisa barrar.
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) redirect("/app/politico");

  const [{ dash, funil, calls }, atendimento] = await Promise.all([
    buscarDashboard(org.orgId),
    buscarAtendimento(org.orgId),
  ]);

  // Tema da org (claro?) p/ o client escolher a paleta de gráfico REAL por tema
  // (recharts usa fill como ATRIBUTO SVG — var(--token) não resolve ali).
  const dbTema = await createClient();
  const { data: orgRow } = await dbTema
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  const claro = ((orgRow?.settings ?? null) as { tema?: unknown } | null)?.tema === "claro";

  return (
    <>
      <DashboardClient dash={dash} funil={funil} calls={calls} claro={claro} atendimento={atendimento} />
    </>
  );
}

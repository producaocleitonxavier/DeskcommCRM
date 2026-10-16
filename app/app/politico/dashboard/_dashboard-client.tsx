"use client";

/**
 * Corpo visual do Dashboard gerencial (War Room 2.0). Client component: usa
 * Recharts (via components/politico/*) e ícones LucideIcon. Recebe as 3 views
 * já buscadas pelo server component (page.tsx) como props serializáveis.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  ChevronDown,
  Heart,
  Megaphone,
  Phone,
  Target,
  UserPlus,
  Users,
} from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { FunnelBoard } from "@/components/politico/funnel-board";
import { PieChartCard } from "@/components/politico/pie-chart-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { StatRow } from "@/components/politico/stat-row";
import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";
import type { CallQueueStatus, DashboardData, FunilKpis } from "./page";

// Hexes do funil (espelham --wr-funnel-1..5).
const FUNIL_HEX = ["#C9CEF3", "#9AA5EA", "#6B79DD", "#4352C4", "#26318F"];
// Gradiente de 6 passos (claro → escuro) para o funil invisível.
const INVISIVEL_HEX = ["#DCE0F7", "#B4BCF0", "#8A95E6", "#6372DD", "#4352C4", "#26318F"];

export interface DashboardClientProps {
  dash: DashboardData | null;
  funil: FunilKpis | null;
  calls: CallQueueStatus | null;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: "var(--color-accent-100)", color: "var(--color-accent-900)" }}
    >
      {children}
    </span>
  );
}

export default function DashboardClient({ dash, funil, calls }: DashboardClientProps) {
  const [invisivelAberto, setInvisivelAberto] = useState(true);

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      {/* ── 1. Header ───────────────────────────────────────────── */}
      <div>
        <Link
          href="/app/politico"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          War Room
        </Link>
        <header className="wr-card mt-3 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-bold leading-tight lg:text-4xl">Dashboard</h1>
            <p className="mt-1.5 text-base text-muted-foreground">Painel central da campanha</p>
          </div>
          {dash && (
            <Badge>
              <Users className="h-3.5 w-3.5" aria-hidden />
              {dash.total_leads.toLocaleString("pt-BR")} leads
            </Badge>
          )}
        </header>
      </div>

      {!dash ? (
        <EmptyState
          icon={BarChart3}
          title="Sem dados ainda"
          description="Cadastre leads políticos para o painel preencher os indicadores da campanha."
          action={{ label: "+ Cadastrar", href: "/app/politico/leads/novo" }}
        />
      ) : (
        <>
          {/* ── 2. KPIs principais ──────────────────────────────── */}
          <section aria-label="Indicadores principais" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Total de leads" valor={dash.total_leads} icone={Users} />
            <KpiCard label="Votos certos" valor={dash.votos_certos} icone={BadgeCheck} variant="dark" />
            <KpiCard label="Militantes" valor={dash.militantes} icone={Megaphone} />
            <KpiCard label="Apoiadores" valor={dash.apoiadores} icone={Heart} />
          </section>

          {/* ── 3. Funil político ───────────────────────────────── */}
          {funil && funil.funil_total > 0 && (
            <section className="wr-card p-6 sm:p-7">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
                <SectionHeader title="Funil Político" subtitle="Distribuição da base pelos estágios" />
                <div className="flex flex-wrap gap-2">
                  <Badge>Taxa de ativação: {funil.taxa_ativacao_pct}%</Badge>
                  <Badge>Taxa de conversão: {funil.taxa_conversao_pct}%</Badge>
                </div>
              </div>
              <FunnelBoard
                className="mt-5"
                data={[
                  { label: "Novo cadastro", value: funil.funil_novo_cadastro, color: FUNIL_HEX[0]! },
                  { label: "Simpatizante", value: funil.funil_simpatizante, color: FUNIL_HEX[1]! },
                  { label: "Apoiador", value: funil.funil_apoiador, color: FUNIL_HEX[2]! },
                  { label: "Militante", value: funil.funil_militante, color: FUNIL_HEX[3]! },
                  { label: "Voto certo", value: funil.funil_voto_certo, color: FUNIL_HEX[4]! },
                ]}
              />
            </section>
          )}

          {/* ── 4. Grid 2x2 de gráficos ─────────────────────────── */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PieChartCard
              title="Distribuição por Nível"
              data={[
                { name: "Novos cadastros", value: dash.novos_cadastros, fill: FUNIL_HEX[0]! },
                { name: "Simpatizantes", value: dash.simpatizantes, fill: FUNIL_HEX[1]! },
                { name: "Apoiadores", value: dash.apoiadores, fill: FUNIL_HEX[2]! },
                { name: "Militantes", value: dash.militantes, fill: FUNIL_HEX[3]! },
                { name: "Votos certos", value: dash.votos_certos, fill: FUNIL_HEX[4]! },
              ]}
            />
            <BarChartCard
              title="Temperatura"
              data={[
                { name: "Quentes", value: dash.leads_quentes, fill: "#EF4444" },
                { name: "Mornos", value: dash.leads_mornos, fill: "#F59E0B" },
                { name: "Frios", value: dash.leads_frios, fill: "#3B82F6" },
              ]}
            />
            <PieChartCard
              title="Módulos Ativos"
              data={[
                { name: "Eventos", value: dash.total_eventos, fill: "#4352C4" },
                { name: "Alertas", value: dash.alertas_ativos, fill: "#EF4444" },
                { name: "Pesquisas", value: dash.pesquisas_ativas, fill: "#F59E0B" },
                { name: "Perfis sociais", value: dash.perfis_monitorados, fill: "#22C55E" },
                { name: "Adversários", value: dash.adversarios_ativos, fill: "#8B5CF6" },
              ]}
            />
            <BarChartCard
              title="Fila de Ligações"
              data={[
                { name: "Pendentes", value: calls?.pendentes ?? dash.ligacoes_pendentes, fill: "#F59E0B" },
                { name: "Completadas", value: calls?.completadas ?? 0, fill: "#22C55E" },
                { name: "Sem resposta", value: calls?.sem_resposta ?? 0, fill: "#EF4444" },
              ]}
            />
          </section>

          {/* ── 5. Fila de ligações (detalhada) ─────────────────── */}
          {calls && calls.total_chamadas > 0 && (
            <section className="wr-card p-6 sm:p-7">
              <SectionHeader title="Fila de Ligações" subtitle="Resultado das chamadas da operação" className="mb-5" />
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiCard label="Total de chamadas" valor={calls.total_chamadas} icone={Phone} />
                <KpiCard label="Apoio confirmado" valor={calls.apoio_confirmado} icone={BadgeCheck} />
                <KpiCard label="Indeciso" valor={calls.indeciso} icone={Target} />
                <KpiCard label="Recusa" valor={calls.recusa} icone={Phone} />
              </div>
              <div className="mt-5">
                <StatRow
                  items={[
                    { label: "Taxa de sucesso", value: `${calls.taxa_sucesso_pct}%`, icon: Target, color: "#17784F" },
                    { label: "Média de tentativas", value: calls.media_tentativas, icon: Phone },
                  ]}
                />
              </div>
            </section>
          )}

          {/* ── 6. Funil invisível (colapsável) ─────────────────── */}
          {funil && funil.invisivel_total > 0 && (
            <section className="wr-card p-6 sm:p-7">
              <button
                type="button"
                onClick={() => setInvisivelAberto((v) => !v)}
                aria-expanded={invisivelAberto}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <h2 className="font-heading text-xl font-bold leading-tight">Funil Invisível</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Jornada de engajamento ({funil.invisivel_total.toLocaleString("pt-BR")} no total)
                  </p>
                </div>
                <ChevronDown
                  className="h-5 w-5 shrink-0 transition-transform duration-200"
                  style={{ color: "var(--color-text-subtle)", transform: invisivelAberto ? "rotate(180deg)" : "none" }}
                  aria-hidden
                />
              </button>
              {invisivelAberto && (
                <div className="mt-5">
                  <BarChartCard
                    title="Estágios de engajamento"
                    horizontal
                    height={320}
                    data={[
                      { name: "Awareness", value: funil.invisivel_awareness, fill: INVISIVEL_HEX[0]! },
                      { name: "Interest", value: funil.invisivel_interest, fill: INVISIVEL_HEX[1]! },
                      { name: "Consideration", value: funil.invisivel_consideration, fill: INVISIVEL_HEX[2]! },
                      { name: "Intent", value: funil.invisivel_intent, fill: INVISIVEL_HEX[3]! },
                      { name: "Evaluation", value: funil.invisivel_evaluation, fill: INVISIVEL_HEX[4]! },
                      { name: "Conversion", value: funil.invisivel_conversion, fill: INVISIVEL_HEX[5]! },
                    ]}
                  />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

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
  Clock,
  MessageCircle,
  MessageCircleWarning,
  Reply,
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
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";
import type { CallQueueStatus, DashboardData, FunilKpis } from "./page";
import { formatarDuracao, type MetricasDeAtendimento } from "@/lib/politico/atendimento-metricas";

// Uma COR DISTINTA por tipo de público (novo cadastro → voto certo): a mesma
// paleta pinta o funil E a pizza "Distribuição por Nível", então a cor vira a
// identidade de cada nível. Antes eram 5 tons de índigo quase iguais — não
// diferenciavam o público. Progressão fria→quente→conquista, vívida no escuro.
// Paleta categórica dos 5 estágios, em DUAS versões: ESCURA (brilhante p/ o
// preto) e CLARA (validada no dataviz — lightness/CVD/contraste>=3:1/piso de
// visão normal TODOS passam; alterna quente/frio p/ cada estágio vizinho ser
// distinto). Hex REAL por tema (não var()): recharts usa `fill` como ATRIBUTO
// SVG, e var(--token) não resolve em atributo.
const FUNIL_HEX_ESCURO = ["#60A5FA", "#22D3EE", "#A78BFA", "#F59E0B", "#34D399"];
const FUNIL_HEX_CLARO = ["#2f66d6", "#c0661a", "#0e9aa8", "#7b4fd0", "#17885a"];
// Gradiente de 6 passos (claro → escuro) para o funil invisível.
const INVISIVEL_HEX = ["#DCE0F7", "#B4BCF0", "#8A95E6", "#6372DD", "#4352C4", "#26318F"];

export interface DashboardClientProps {
  dash: DashboardData | null;
  funil: FunilKpis | null;
  calls: CallQueueStatus | null;
  /** Org em tema claro? Escolhe a paleta de gráfico validada p/ o claro. */
  claro: boolean;
  /** Números de atendimento dos últimos 30 dias (conversas, resposta, horário). */
  atendimento: MetricasDeAtendimento;
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

export default function DashboardClient({ dash, funil, calls, claro, atendimento }: DashboardClientProps) {
  const FUNIL_HEX = claro ? FUNIL_HEX_CLARO : FUNIL_HEX_ESCURO;
  const [invisivelAberto, setInvisivelAberto] = useState(true);
  // "Fila de Ligações" exige um serviço de call-center configurado. Sem chamadas
  // reais o card ficava VAZIO no painel (parece quebrado, promete o que o
  // gabinete não tem). Só mostra quando há atividade de ligações; senão as 3
  // cartas restantes ocupam uma linha limpa de 3.
  const mostrarFila = !!(calls && calls.total_chamadas > 0);

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] px-4 py-7 space-y-6">
      {/* ── 1. Header ───────────────────────────────────────────── */}
      <div>
        <Link
          href="/app/politico"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          GIP
        </Link>
        <div className="mt-3">
          <CommandHero
            eyebrow="GIP · Painel"
            titulo="Dashboard"
            subtitulo="Panorama central da campanha."
            extra={
              dash ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "color-mix(in srgb, var(--color-accent) 18%, transparent)", color: "var(--color-accent)", border: "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)" }}
                >
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {dash.total_leads.toLocaleString("pt-BR")} contatos
                </span>
              ) : undefined
            }
          />
        </div>
      </div>

      {!dash ? (
        <EmptyState
          icon={BarChart3}
          title="Sem dados ainda"
          description="Cadastre pessoas da sua base para o painel preencher os indicadores da campanha."
          action={{ label: "+ Cadastrar", href: "/app/politico/leads/novo" }}
        />
      ) : (
        <>
          {/* ── 2. KPIs principais ──────────────────────────────── */}
          <section aria-label="Indicadores principais" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Total de contatos" valor={dash.total_leads} icone={Users} />
            <KpiCard label="Votos certos" valor={dash.votos_certos} icone={BadgeCheck} variant="dark" />
            <KpiCard label="Militantes" valor={dash.militantes} icone={Megaphone} />
            <KpiCard label="Apoiadores" valor={dash.apoiadores} icone={Heart} />
          </section>

          <BlocoAtendimento m={atendimento} claro={claro} />

          {/* ── 3. Funil político ───────────────────────────────── */}
          {funil && funil.funil_total > 0 && (
            <section className="gip-glass p-6 sm:p-7">
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

          {/* ── 4. Grid de gráficos (2x2 com Fila; 3-em-linha sem) ── */}
          <section className={`grid grid-cols-1 gap-4 ${mostrarFila ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
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
            {mostrarFila && (
              <BarChartCard
                title="Fila de Ligações"
                data={[
                  { name: "Pendentes", value: calls?.pendentes ?? dash.ligacoes_pendentes, fill: "#F59E0B" },
                  { name: "Completadas", value: calls?.completadas ?? 0, fill: "#22C55E" },
                  { name: "Sem resposta", value: calls?.sem_resposta ?? 0, fill: "#EF4444" },
                ]}
              />
            )}
          </section>

          {/* ── 5. Fila de ligações (detalhada) ─────────────────── */}
          {calls && calls.total_chamadas > 0 && (
            <section className="gip-glass p-6 sm:p-7">
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
            <section className="gip-glass p-6 sm:p-7">
              <button
                type="button"
                onClick={() => setInvisivelAberto((v) => !v)}
                aria-expanded={invisivelAberto}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <h2 className="font-heading text-xl font-bold leading-tight">Termômetro de Base</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Quão engajada está a sua base ({funil.invisivel_total.toLocaleString("pt-BR")} pessoas no total)
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
                      { name: "Descoberta", value: funil.invisivel_awareness, fill: INVISIVEL_HEX[0]! },
                      { name: "Interesse", value: funil.invisivel_interest, fill: INVISIVEL_HEX[1]! },
                      { name: "Consideração", value: funil.invisivel_consideration, fill: INVISIVEL_HEX[2]! },
                      { name: "Intenção", value: funil.invisivel_intent, fill: INVISIVEL_HEX[3]! },
                      { name: "Avaliação", value: funil.invisivel_evaluation, fill: INVISIVEL_HEX[4]! },
                      { name: "Conversão", value: funil.invisivel_conversion, fill: INVISIVEL_HEX[5]! },
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

// -- Atendimento (últimos 30 dias) --------------------------------------------

/**
 * O que o gabinete precisa bater o olho e saber: quantas pessoas procuraram,
 * quantas ficaram sem resposta, em quanto tempo sai a 1ª resposta e em que hora
 * o cidadão escreve. Série única → uma cor só; o pico vai em destaque e é o
 * único com o número escrito (o resto aparece ao passar o mouse).
 */
function BlocoAtendimento({ m, claro }: { m: MetricasDeAtendimento; claro: boolean }) {
  const maxHora = Math.max(1, ...m.recebidasPorHora);
  const totalRecebidas = m.recebidasPorHora.reduce((a, b) => a + b, 0);
  const cor = claro ? "#1F3A5F" : "#C4E64A";
  const quemRespondeu =
    m.respondidas === 0
      ? "Ainda sem respostas no período."
      : `Primeira resposta: ${m.primeiraRespostaPelaIA} pela IA · ${m.primeiraRespostaPorPessoa} por uma pessoa da equipe.`;

  return (
    <section aria-label="Atendimento nos últimos 30 dias" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Atendimento
        </h2>
        <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          últimos 30 dias ·{" "}
          <Link href="/app/metrics" className="underline underline-offset-2">
            ver detalhe em Desempenho
          </Link>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Pessoas que procuraram o gabinete" valor={m.conversas} icone={MessageCircle} />
        <KpiCard
          label="Responderam em (metade dos casos)"
          valor={formatarDuracao(m.medianaPrimeiraRespostaSeg)}
          icone={Clock}
        />
        <KpiCard
          label="Conversas respondidas"
          valor={m.taxaDeResposta === null ? "—" : m.taxaDeResposta}
          {...(m.taxaDeResposta === null ? {} : { sufixo: "%" })}
          icone={Reply}
        />
        <KpiCard
          label="Ficaram sem resposta"
          valor={m.semResposta}
          icone={MessageCircleWarning}
          {...(m.semResposta > 0 ? { cor: "#C2410C" } : {})}
        />
      </div>

      <div className="gip-glass p-6 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
            Em que hora o cidadão escreve
          </h3>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {m.horaDePico === null
              ? "Sem mensagens recebidas no período."
              : `Pico às ${m.horaDePico}h · ${totalRecebidas.toLocaleString("pt-BR")} mensagens recebidas`}
          </span>
        </div>

        <div
          className="mt-5 flex h-40 items-end gap-[2px]"
          role="img"
          aria-label={
            m.horaDePico === null
              ? "Sem mensagens recebidas nos últimos 30 dias."
              : `Mensagens recebidas por hora do dia. Pico às ${m.horaDePico} horas, com ${m.recebidasPorHora[m.horaDePico] ?? 0} mensagens.`
          }
        >
          {m.recebidasPorHora.map((n, h) => {
            const pico = h === m.horaDePico;
            return (
              <div key={h} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${h}h — ${n} mensagens`}>
                {pico && (
                  <span className="mb-1 text-xs font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
                    {n}
                  </span>
                )}
                <div
                  className="w-full rounded-t-[4px]"
                  style={{
                    height: n === 0 ? 2 : `${Math.max(4, Math.round((n / maxHora) * 100))}%`,
                    background: cor,
                    opacity: n === 0 ? 0.18 : pico ? 1 : 0.55,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-[2px]" aria-hidden>
          {m.recebidasPorHora.map((_, h) => (
            <span key={h} className="min-w-0 flex-1 text-center text-[10px] tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
              {h % 3 === 0 ? `${h}h` : ""}
            </span>
          ))}
        </div>

        <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {quemRespondeu}
        </p>
      </div>
    </section>
  );
}

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
        <div>
          <CommandHero
            eyebrow="Hoje · Painel"
            titulo="Painel"
            subtitulo="Os números do mandato num só lugar: a base, o atendimento e a equipe."
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
                <SectionHeader title="Como a base está distribuída" subtitle="Quantas pessoas há em cada nível de proximidade com o mandato" />
              </div>
              <FunnelBoard
                showConversion={false}
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
          <section className={`grid grid-cols-1 gap-4 ${mostrarFila ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
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
          label="Tempo até a primeira resposta"
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
              : `${totalRecebidas.toLocaleString("pt-BR")} mensagens recebidas em 30 dias`}
          </span>
        </div>

        <GraficoPorHora porHora={m.recebidasPorHora} pico={m.horaDePico} claro={claro} />

        <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {quemRespondeu}
        </p>
      </div>
    </section>
  );
}

// -- Gráfico: mensagens recebidas por hora do dia ------------------------------

const PERIODOS = [
  { nome: "Madrugada", artigo: "de madrugada", de: 0, ate: 5 },
  { nome: "Manhã", artigo: "de manhã", de: 6, ate: 11 },
  { nome: "Tarde", artigo: "à tarde", de: 12, ate: 17 },
  { nome: "Noite", artigo: "à noite", de: 18, ate: 23 },
] as const;

const TETOS = [4, 6, 8, 12, 16, 20, 30, 40, 60, 80, 100, 150, 200, 300, 400, 600, 800, 1000];

function listarHoras(horas: number[]): string {
  const t = horas.map((h) => `${h}h`);
  if (t.length <= 1) return t.join("");
  return `${t.slice(0, -1).join(", ")} e ${t[t.length - 1]}`;
}

/**
 * Responde, nesta ordem, o que o gabinete quer saber: (1) em que TURNO chega a
 * maior parte — frase grande no topo; (2) quais as horas mais cheias — barras
 * escuras com o número; (3) o detalhe de qualquer hora — passar o mouse/tocar.
 * Série única → um matiz só. O teto da escala fica sempre acima da maior barra
 * (respiro), e a barra tem largura máxima para não virar "bloco" em tela larga.
 */
function GraficoPorHora({ porHora, claro }: { porHora: number[]; pico: number | null; claro: boolean }) {
  const [sobre, setSobre] = useState<number | null>(null);
  const total = porHora.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <p className="mt-5 rounded-xl px-4 py-8 text-center text-sm" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", color: "var(--color-text-subtle)" }}>
        Ainda não chegou mensagem no período. O gráfico aparece quando o cidadão começar a escrever.
      </p>
    );
  }

  const max = Math.max(...porHora);
  const teto = TETOS.find((t) => t >= max * 1.15) ?? Math.ceil((max * 1.15) / 500) * 500;
  const picos = porHora.map((n, h) => (n === max ? h : -1)).filter((h) => h >= 0);
  const rotulaPicos = picos.length <= 4;
  const corBarra = claro ? "#5B84B8" : "#6F97CF";
  const corForte = claro ? "#14315A" : "#C4E64A";

  const turnos = PERIODOS.map((p) => {
    const qtd = porHora.slice(p.de, p.ate + 1).reduce((a, b) => a + b, 0);
    return { ...p, qtd, fatia: Math.round((qtd * 100) / total) };
  });
  const turnoCheio = turnos.reduce((a, b) => (b.qtd > a.qtd ? b : a), { ...PERIODOS[0], qtd: -1, fatia: 0 });

  return (
    <div className="mt-4">
      {/* 1. A resposta, em uma frase */}
      <p className="text-xl font-semibold leading-snug sm:text-2xl" style={{ color: "var(--color-text)" }}>
        A maior parte chega {turnoCheio.artigo}:{" "}
        <span className="tabular-nums" style={{ color: corForte }}>{turnoCheio.fatia}%</span>
        <span className="text-sm font-normal sm:text-base" style={{ color: "var(--color-text-muted)" }}>
          {" "}das mensagens, entre {turnoCheio.de}h e {turnoCheio.ate + 1}h
        </span>
      </p>

      {/* 2. Leitura da hora (mouse/toque) ou as horas mais cheias */}
      <p className="mt-1 min-h-[1.25rem] text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }} aria-live="polite">
        {sobre !== null ? (
          <>
            <strong style={{ color: "var(--color-text)" }}>{sobre}h às {(sobre + 1) % 24}h</strong>
            {" · "}{porHora[sobre] ?? 0} {(porHora[sobre] ?? 0) === 1 ? "mensagem" : "mensagens"}
            {" · "}{Math.round(((porHora[sobre] ?? 0) * 100) / total)}% do total
          </>
        ) : (
          <>
            {picos.length === 1 ? "Hora mais cheia: " : "Horas mais cheias: "}
            <strong style={{ color: "var(--color-text)" }}>{listarHoras(picos)}</strong>
            {" · "}{max} {max === 1 ? "mensagem" : "mensagens"}{picos.length > 1 ? " cada" : ""}
          </>
        )}
      </p>

      <div className="mt-4 flex gap-2">
        {/* Escala */}
        <div className="relative h-48 w-5 shrink-0 text-right text-[10px] tabular-nums sm:h-56" style={{ color: "var(--color-text-subtle)" }} aria-hidden>
          <span className="absolute right-0 top-0 -translate-y-1/2">{teto}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{teto / 2}</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="relative h-48 sm:h-56"
            role="img"
            aria-label={`Mensagens recebidas por hora do dia, nos últimos 30 dias. Horas mais cheias: ${listarHoras(picos)}, com ${max} mensagens. ${turnos.map((t) => `${t.nome}: ${t.fatia}%`).join(", ")}.`}
            onMouseLeave={() => setSobre(null)}
          >
            {/* Turnos: o mais cheio ganha um fundo leve; divisórias finas entre eles */}
            <div className="absolute inset-0 flex" aria-hidden>
              {turnos.map((t, i) => (
                <div
                  key={t.nome}
                  className="h-full flex-1"
                  style={{
                    background: t.nome === turnoCheio.nome ? `color-mix(in srgb, ${corForte} ${claro ? 7 : 9}%, transparent)` : "transparent",
                    borderLeft: i === 0 ? undefined : "1px solid color-mix(in srgb, var(--color-text) 9%, transparent)",
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                  }}
                />
              ))}
            </div>
            {/* Grade */}
            {[0, 50, 100].map((y) => (
              <div key={y} className="absolute inset-x-0" style={{ bottom: `${y}%`, borderTop: `1px ${y === 0 ? "solid" : "dashed"} color-mix(in srgb, var(--color-text) ${y === 0 ? 25 : 10}%, transparent)` }} aria-hidden />
            ))}
            {/* Barras */}
            <div className="absolute inset-0 flex items-end">
              {porHora.map((n, h) => {
                const ehPico = n === max;
                const ativo = h === sobre;
                const mostraNumero = n > 0 && (ativo || (ehPico && rotulaPicos && sobre === null));
                return (
                  <button
                    key={h}
                    type="button"
                    onMouseEnter={() => setSobre(h)}
                    onFocus={() => setSobre(h)}
                    onBlur={() => setSobre(null)}
                    onClick={() => setSobre(h)}
                    className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end px-[1px] outline-none sm:px-[3px]"
                    aria-label={`${h} horas: ${n} mensagens`}
                  >
                    {mostraNumero && (
                      <span className="mb-1 text-[11px] font-bold tabular-nums leading-none" style={{ color: "var(--color-text)" }}>{n}</span>
                    )}
                    <span
                      className="block w-full max-w-[28px] rounded-t-[5px] transition-colors duration-150"
                      style={{
                        height: n === 0 ? 0 : `${Math.max(2.5, (n / teto) * 100)}%`,
                        background: ehPico || ativo ? corForte : corBarra,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horas: de 3 em 3, casando com a virada dos turnos */}
          <div className="mt-1.5 flex" aria-hidden>
            {porHora.map((_, h) => (
              <span key={h} className="flex min-w-0 flex-1 justify-center text-[10px] tabular-nums" style={{ color: h === sobre ? "var(--color-text)" : "var(--color-text-subtle)", fontWeight: h === sobre ? 700 : 400 }}>
                <span className="whitespace-nowrap">{h === sobre || (sobre === null && h % 3 === 0) ? `${h}h` : ""}</span>
              </span>
            ))}
          </div>

          {/* Turnos, alinhados com as faixas do gráfico */}
          <div className="mt-2 flex">
            {turnos.map((t, i) => {
              const cheio = t.nome === turnoCheio.nome;
              return (
                <div
                  key={t.nome}
                  className="min-w-0 flex-1 pt-2 text-center sm:px-1"
                  style={{
                    borderTop: `3px solid ${cheio ? corForte : "color-mix(in srgb, var(--color-text) 12%, transparent)"}`,
                    marginLeft: i === 0 ? 0 : 4,
                  }}
                >
                  <div className="whitespace-nowrap text-[10px] font-semibold tracking-tight sm:text-xs sm:tracking-normal" style={{ color: cheio ? "var(--color-text)" : "var(--color-text-muted)" }}>{t.nome}</div>
                  <div className="text-lg font-bold tabular-nums leading-tight sm:text-xl" style={{ color: cheio ? corForte : "var(--color-text)" }}>{t.fatia}%</div>
                  <div className="whitespace-nowrap text-[10px] tabular-nums sm:text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                    {t.qtd} <span className="hidden sm:inline">{t.qtd === 1 ? "mensagem" : "mensagens"}</span><span className="sm:hidden">msg</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

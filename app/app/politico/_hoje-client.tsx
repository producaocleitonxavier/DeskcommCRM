"use client";

/**
 * Corpo visual da tela "Hoje" (War Room 2.0). Client component: usa Recharts
 * (via components/politico/*) e ícones LucideIcon. Recebe os dados já buscados
 * pelo server component (page.tsx) como props serializáveis.
 */

import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Gift,
  Inbox,
  Users,
} from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { FunnelBoard } from "@/components/politico/funnel-board";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { AreaChartCard } from "@/components/politico/area-chart-card";
import { SectionHeader } from "@/components/politico/section-header";
import type { MetricasHoje, GabineteHoje } from "./page";

// Hexes do funil (espelham --wr-funnel-1..5) — Recharts aplica fill como
// atributo SVG, onde var(--x) não é confiável.
const FUNIL_HEX = ["#C9CEF3", "#9AA5EA", "#6B79DD", "#4352C4", "#26318F"];

type Tipo = "risk" | "warn" | "ok";

const TIPO_CORES: Record<Tipo, { soft: string; strong: string }> = {
  risk: { soft: "#FBE4E2", strong: "#A3302A" },
  warn: { soft: "#FCF1DC", strong: "#8A5A10" },
  ok: { soft: "#E2F5EC", strong: "#17784F" },
};

export interface HojeClientProps {
  metrics: MetricasHoje;
  gabineteHoje: GabineteHoje;
  nome: string;
  saudacao: string;
  dataFormatada: string;
  horaAtualizacao: string;
}

function badgeAtencao(a: GabineteHoje["atencao"][number]): { label: string; tipo: Tipo } {
  if (a.categoria === "atrasada") return { label: "Atrasada", tipo: "risk" };
  if (a.categoria === "vence") {
    if (!a.prazoISO) return { label: "Vence em breve", tipo: "warn" };
    const dias = Math.ceil((new Date(a.prazoISO).getTime() - Date.now()) / 86_400_000);
    return { label: dias <= 0 ? "Vence hoje" : `Vence em ${dias}d`, tipo: "warn" };
  }
  return { label: a.prioridade === "urgente" ? "Urgente" : "Alta prioridade", tipo: "warn" };
}

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Medidor circular (donut SVG) da taxa de resolução de demandas. */
function GaugeResolucao({ pct, resolvidas, total }: { pct: number; resolvidas: number; total: number }) {
  const size = 128;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.min(Math.max(pct, 0), 100);
  const offset = circ * (1 - p / 100);
  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#D7F36A"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-2xl font-bold" style={{ color: "#FFFFFF" }}>{pct}%</span>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>resolvidas</span>
        </div>
      </div>
      <div className="hidden sm:block">
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.88)" }}>
          <span className="font-bold">{resolvidas}</span> de {total}
        </div>
        <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>demandas resolvidas</div>
      </div>
    </div>
  );
}

export default function HojeClient({
  metrics: m,
  gabineteHoje: g,
  nome,
  saudacao,
  dataFormatada,
  horaAtualizacao,
}: HojeClientProps) {
  // Funil de ATENDIMENTO (ciclo de vida da demanda) — não o funil de campanha.
  const lifecycleData = g.lifecycle.map((s, i) => ({
    label: s.label,
    value: s.count,
    color: FUNIL_HEX[i] ?? FUNIL_HEX[FUNIL_HEX.length - 1]!,
  }));
  const AREA_HEX = ["#D7F36A", "#60A5FA", "#F59E0B", "#22C55E", "#A78BFA", "#F472B6"];
  const porAreaData = g.porArea.map((a, i) => ({ name: a.name, value: a.value, fill: AREA_HEX[i % AREA_HEX.length]! }));
  const registradasData = g.registradas14d;

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      {/* ── 1. Centro de Comando (hero tático) ──────────────────── */}
      <header
        className="wr-card relative overflow-hidden p-6 sm:p-8"
        style={{
          background: "linear-gradient(135deg,#0E1116 0%,#14181F 55%,#1A2410 100%)",
          border: "1px solid rgba(215,243,106,0.22)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full"
          style={{ background: "radial-gradient(closest-side,rgba(215,243,106,0.16),transparent)" }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#D7F36A" }}>
              Centro de Comando · Gabinete
            </span>
            <h1 className="font-heading mt-1.5 text-3xl font-bold leading-tight sm:text-4xl" style={{ color: "#FFFFFF" }}>
              {saudacao}
              {nome ? `, ${nome}` : ""}
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
              {dataFormatada} · atualizado às {horaAtualizacao}
              {g.resumo.nomeParlamentar ? ` · ${g.resumo.nomeParlamentar}` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/app/politico/demandas/nova"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
                style={{ background: "#D7F36A", color: "#14181F" }}
              >
                <Inbox className="h-4 w-4" aria-hidden /> Nova demanda
              </Link>
              {[
                { href: "/app/politico/demandas", label: "Demandas" },
                { href: "/app/politico/agenda", label: "Agenda" },
                { href: "/app/politico/liderancas/novo", label: "Nova liderança" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-medium transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)" }}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
          <GaugeResolucao pct={g.resumo.taxaResolucao} resolvidas={g.resumo.resolvidas} total={g.resumo.totalDemandas} />
        </div>
      </header>

      {/* ── 1b. No gabinete hoje ────────────────────────────────── */}
      <section aria-label="No gabinete hoje" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Precisam de atenção */}
        <div className="wr-card p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "#FBE4E2", color: "#A3302A" }} aria-hidden>
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Precisam de atenção</h2>
          </div>
          {g.atencao.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhuma demanda atrasada ou urgente. 👏</p>
          ) : (
            <ul className="space-y-1.5">
              {g.atencao.map((a) => {
                const b = badgeAtencao(a);
                const c = TIPO_CORES[b.tipo];
                return (
                  <li key={a.id}>
                    <Link href={`/app/politico/demandas/${a.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-elevated)]">
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: c.soft, color: c.strong }}>{b.label}</span>
                      <span className="truncate text-sm" style={{ color: "var(--color-text)" }}>{a.assunto}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Agenda de hoje */}
        <div className="wr-card p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(59,130,246,0.14)", color: "#3B82F6" }} aria-hidden>
                <Calendar className="h-4 w-4" />
              </span>
              <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Agenda de hoje</h2>
            </div>
            <Link href="/app/politico/agenda" className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>ver tudo</Link>
          </div>
          {g.agenda.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Sem compromissos hoje.</p>
          ) : (
            <ul className="space-y-1.5">
              {g.agenda.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/politico/agenda/${c.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-elevated)]">
                    <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--color-text-muted)", minWidth: 42 }}>
                      {c.diaInteiro ? "dia" : horaDe(c.dataISO)}
                    </span>
                    <span className="truncate text-sm" style={{ color: "var(--color-text)" }}>
                      {c.titulo}
                      {c.local ? <span style={{ color: "var(--color-text-subtle)" }}> · {c.local}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Aniversariantes */}
        <div className="wr-card p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.18)", color: "#7E8F2B" }} aria-hidden>
              <Gift className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Aniversariantes (lideranças)</h2>
          </div>
          {g.aniversariantes.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhum aniversário de liderança hoje.</p>
          ) : (
            <ul className="space-y-1.5">
              {g.aniversariantes.map((l) => (
                <li key={l.id}>
                  <Link href={`/app/politico/liderancas/${l.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-elevated)]">
                    <span className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>{l.nome}</span>
                    {l.cidade ? <span className="shrink-0 text-xs" style={{ color: "var(--color-text-subtle)" }}>{l.cidade}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── 2. KPIs do gabinete ─────────────────────────────────── */}
      <section aria-label="Números principais" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Base de contatos" valor={m.totalPessoas} icone={Users} />
        <KpiCard label="Demandas abertas" valor={g.resumo.abertas} icone={Inbox} />
        <KpiCard label="Resolvidas este mês" valor={g.resumo.resolvidasMes} icone={CheckCircle2} />
        <KpiCard
          label="Tempo médio (dias)"
          valor={g.resumo.tempoMedioDias ?? 0}
          icone={Clock}
        />
      </section>

      {/* ── 3. Funil de atendimento (ciclo da demanda) ──────────── */}
      <section className="wr-card p-6 sm:p-7">
        <SectionHeader
          title="Funil de atendimento"
          subtitle="O caminho de cada demanda até a resolução"
          action={{ label: "Ver demandas", href: "/app/politico/demandas" }}
          className="mb-2"
        />
        <FunnelBoard data={lifecycleData} className="mt-5" />
      </section>

      {/* ── 4. Demandas por área + evolução ─────────────────────── */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BarChartCard title="Demandas por área" data={porAreaData} />
        <AreaChartCard title="Registradas (últimos 14 dias)" data={registradasData} color="#C4E64A" />
      </section>
    </div>
  );
}

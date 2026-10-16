"use client";

/**
 * Corpo visual da tela "Hoje" (War Room 2.0). Client component: usa Recharts
 * (via components/politico/*) e ícones LucideIcon. Recebe os dados já buscados
 * pelo server component (page.tsx) como props serializáveis.
 */

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Heart,
  Inbox,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { FunnelBoard } from "@/components/politico/funnel-board";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { AreaChartCard } from "@/components/politico/area-chart-card";
import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";
import type { MetricasHoje } from "./page";

// Hexes do funil (espelham --wr-funnel-1..5) — Recharts aplica fill como
// atributo SVG, onde var(--x) não é confiável.
const FUNIL_HEX = ["#C9CEF3", "#9AA5EA", "#6B79DD", "#4352C4", "#26318F"];

type Tipo = "risk" | "warn" | "ok";

const TIPO_CORES: Record<Tipo, { soft: string; strong: string }> = {
  risk: { soft: "#FBE4E2", strong: "#A3302A" },
  warn: { soft: "#FCF1DC", strong: "#8A5A10" },
  ok: { soft: "#E2F5EC", strong: "#17784F" },
};

interface Prioridade {
  tipo: Tipo;
  label: string;
  icon: LucideIcon;
  titulo: string;
  descricao: string;
  href: string;
  cta: string;
}

function plural(n: number, singular: string, pluralForma: string): string {
  return n === 1 ? singular : pluralForma;
}

export interface HojeClientProps {
  metrics: MetricasHoje;
  nome: string;
  saudacao: string;
  dataFormatada: string;
  horaAtualizacao: string;
}

export default function HojeClient({
  metrics: m,
  nome,
  saudacao,
  dataFormatada,
  horaAtualizacao,
}: HojeClientProps) {
  const funnelData = m.funilStages.map((s, i) => ({
    label: s.label,
    value: s.count,
    color: FUNIL_HEX[i] ?? FUNIL_HEX[FUNIL_HEX.length - 1]!,
  }));

  const temperaturaData = [
    { name: "Quentes", value: m.temperaturas.quentes, fill: "#EF4444" },
    { name: "Mornos", value: m.temperaturas.mornos, fill: "#F59E0B" },
    { name: "Frios", value: m.temperaturas.frios, fill: "#3B82F6" },
  ];

  // Monta as prioridades do dia a partir das métricas (ordem = impacto).
  const prioridades: Prioridade[] = [];
  if (m.alertasAtivos > 0) {
    prioridades.push({
      tipo: "risk",
      label: "Urgente",
      icon: AlertTriangle,
      titulo: `${m.alertasAtivos} ${plural(m.alertasAtivos, "alerta ativo", "alertas ativos")}`,
      descricao: "Sentimento, adversários e fake news pedem atenção.",
      href: "/app/politico/alertas",
      cta: "Ver alertas",
    });
  }
  if (m.demandasUrgentes > 0) {
    prioridades.push({
      tipo: "warn",
      label: "Vence até sexta",
      icon: Clock,
      titulo: `${m.demandasUrgentes} ${plural(m.demandasUrgentes, "demanda no prazo curto", "demandas no prazo curto")}`,
      descricao: "Encaminhamentos pendentes no gabinete.",
      href: "/app/politico/demandas",
      cta: "Ver demandas",
    });
  }
  if (m.ativadasSemana > 0) {
    prioridades.push({
      tipo: "ok",
      label: "Momentum",
      icon: TrendingUp,
      titulo: `${m.ativadasSemana.toLocaleString("pt-BR")} ${plural(m.ativadasSemana, "ativação esta semana", "ativações esta semana")}`,
      descricao: "Transições no funil. Mantenha a mobilização.",
      href: "/app/politico/funil",
      cta: "Ver funil",
    });
  }
  if (m.totalPessoas === 0) {
    prioridades.push({
      tipo: "warn",
      label: "Comece aqui",
      icon: UserPlus,
      titulo: "Sua base está vazia",
      descricao: "Cadastre ou importe seus primeiros contatos para começar.",
      href: "/app/politico/leads/novo",
      cta: "+ Cadastrar",
    });
  }

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      {/* ── 1. Header / saudação ────────────────────────────────── */}
      <header className="wr-card flex flex-wrap items-center justify-between gap-5 p-6 sm:p-7">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{dataFormatada}</p>
          <h1 className="font-heading mt-1 text-3xl font-bold leading-tight lg:text-4xl">
            {saudacao}
            {nome ? `, ${nome}` : ""}
          </h1>
          <span
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}
          >
            <Clock className="h-3 w-3" aria-hidden />
            Atualizado às {horaAtualizacao}
          </span>
        </div>
        <Link
          href="/app/politico/leads/novo"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-5 text-sm font-semibold"
          style={{ background: "#D7F36A", color: "var(--color-text)" }}
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Novo cadastro
        </Link>
      </header>

      {/* ── 2. KPIs ─────────────────────────────────────────────── */}
      <section aria-label="Números principais" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total de pessoas" valor={m.totalPessoas} icone={Users} />
        <KpiCard label="Ativadas esta semana" valor={m.ativadasSemana} icone={Activity} />
        <KpiCard label="Apoiadores ou mais" valor={m.apoiadoresOuMais} icone={Heart} />
        <KpiCard label="Demandas abertas" valor={m.demandasGabinete} icone={Inbox} />
      </section>

      {/* ── 3. Funil Político ───────────────────────────────────── */}
      <section className="wr-card p-6 sm:p-7">
        <SectionHeader
          title="Funil Político"
          subtitle="O mesmo funil em todo o sistema"
          action={{ label: "Ver detalhes", href: "/app/politico/funil" }}
          className="mb-2"
        />
        <FunnelBoard data={funnelData} className="mt-5" />
      </section>

      {/* ── 4. Temperatura + Ativações ──────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BarChartCard title="Temperatura dos Leads" data={temperaturaData} />
        <AreaChartCard title="Ativações da Semana" data={m.ativacoesPorDia} color="#C4E64A" />
      </section>

      {/* ── 5. Prioridades do dia ───────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader title="Prioridades do dia" subtitle="Ordenadas por impacto" />
        {prioridades.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Tudo em ordem"
            description="Nenhuma prioridade crítica hoje. Bom trabalho — foco no que faz a base crescer."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {prioridades.map((p, i) => {
              const Icone = p.icon;
              const c = TIPO_CORES[p.tipo];
              return (
                <Link
                  key={i}
                  href={p.href}
                  className="wr-card group flex items-center gap-4 p-5 transition-colors hover:bg-[var(--color-surface-elevated)]"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{ background: c.soft }}
                    aria-hidden
                  >
                    <Icone className="h-5 w-5" style={{ color: c.strong }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ background: c.soft, color: c.strong }}
                    >
                      {p.label}
                    </span>
                    <div className="mt-1 font-semibold leading-snug">{p.titulo}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{p.descricao}</div>
                  </div>
                  <span
                    className="hidden shrink-0 items-center gap-1 text-sm font-semibold sm:inline-flex"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {p.cta}
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

/**
 * Visual do Decision Engine (War Room 2.0): KPIs, cards de recomendação
 * (prioridade = severidade, impacto = ação recomendada) e alertas ativos.
 */

import Link from "next/link";
import { AlertTriangle, Bell, Clock, Lightbulb } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";

const SEVERIDADE: Record<string, { label: string; border: string; bg: string; fg: string }> = {
  info: { label: "Info", border: "#6B7280", bg: "#F0F0EB", fg: "#5B606B" },
  low: { label: "Baixa", border: "#22C55E", bg: "#E2F5EC", fg: "#17784F" },
  medium: { label: "Média", border: "#3B82F6", bg: "#E4E7F8", fg: "#2F3DA8" },
  high: { label: "Alta", border: "#F59E0B", bg: "#FCF1DC", fg: "#8A5A10" },
  critical: { label: "Crítica", border: "#EF4444", bg: "#FBE4E2", fg: "#A3302A" },
};

const SIGNAL_TYPE: Record<string, string> = {
  sentiment_shift: "Mudança de sentimento",
  engagement_spike: "Pico de engajamento",
  opponent_move: "Movimento adversário",
  territory_change: "Mudança territorial",
  crisis_signal: "Sinal de crise",
  opportunity: "Oportunidade",
};

export interface SinalItem {
  id: string;
  title: string;
  description: string | null;
  signalType: string;
  severity: string;
  status: string;
  recommendedAction: string | null;
  createdAt: string;
}

export interface AlertaItem {
  id: string;
  title: string;
  alertType: string | null;
  severity: string;
  createdAt: string;
}

export interface DecisaoClientProps {
  kpis: { total: number; pendentes: number; criticos: number; alertas: number };
  sinais: SinalItem[];
  alertas: AlertaItem[];
}

export default function DecisaoClient({ kpis, sinais, alertas }: DecisaoClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <SectionHeader title="Decision Engine" subtitle="Sinais estratégicos e ações recomendadas por IA." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Sinais totais" valor={kpis.total} icone={Lightbulb} />
        <KpiCard label="Pendentes" valor={kpis.pendentes} icone={Clock} />
        <KpiCard label="Críticos" valor={kpis.criticos} icone={AlertTriangle} />
        <KpiCard label="Alertas ativos" valor={kpis.alertas} icone={Bell} />
      </section>

      {alertas.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Alertas ativos" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {alertas.map((a) => {
              const sev = SEVERIDADE[a.severity] ?? SEVERIDADE.medium!;
              return (
                <Link key={a.id} href="/app/politico/alertas" className="wr-card flex items-start gap-3 p-4 transition-shadow duration-200 hover:shadow-md">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{a.title}</h3>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: sev.bg, color: sev.fg }}>{sev.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {(a.alertType ?? "").replace(/_/g, " ")} · {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader title={`Recomendações estratégicas (${sinais.length})`} />
        {sinais.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="Nenhuma recomendação ainda"
            description="Os sinais são gerados automaticamente quando inteligência social, adversários e análise territorial estão ativos."
          />
        ) : (
          <div className="space-y-3">
            {sinais.map((s) => {
              const sev = SEVERIDADE[s.severity] ?? SEVERIDADE.medium!;
              return (
                <div key={s.id} className="wr-card p-5" style={{ borderLeft: `4px solid ${sev.border}` }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{s.title}</h3>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: sev.bg, color: sev.fg }}>
                      Prioridade {sev.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{SIGNAL_TYPE[s.signalType] ?? s.signalType.replace(/_/g, " ")}</span>
                    {s.status === "pending" && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#FCF1DC", color: "#8A5A10" }}>Pendente</span>
                    )}
                  </div>
                  {s.description && <p className="mt-1.5 text-sm text-muted-foreground">{s.description}</p>}
                  {s.recommendedAction && (
                    <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: "var(--color-accent-50)", color: "var(--color-accent-900)" }}>
                      <strong>Impacto esperado / ação:</strong> {s.recommendedAction}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

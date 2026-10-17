"use client";

/**
 * Visual do Radar de Narrativas (War Room 2.0): KPIs, distribuição de
 * sentimento (PieChart, cores do semáforo) e cards de narrativa.
 */

import { Activity, AlertTriangle, MessageSquare, TrendingUp } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { PieChartCard } from "@/components/politico/pie-chart-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";

const SENTIMENTO: Record<string, { label: string; bg: string; fg: string }> = {
  positive: { label: "Positivo", bg: "#E2F5EC", fg: "#17784F" },
  negative: { label: "Negativo", bg: "#FBE4E2", fg: "#A3302A" },
  neutral: { label: "Neutro", bg: "#F0F0EB", fg: "#5B606B" },
  mixed: { label: "Misto", bg: "#FCF1DC", fg: "#8A5A10" },
};

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  monitoring: { label: "Monitorando", bg: "#F0F0EB", fg: "#5B606B" },
  opportunity: { label: "Oportunidade", bg: "#E2F5EC", fg: "#17784F" },
  threat: { label: "Ameaça", bg: "#FCF1DC", fg: "#8A5A10" },
  crisis: { label: "Crise", bg: "#FBE4E2", fg: "#A3302A" },
  resolved: { label: "Resolvida", bg: "#E4E7F8", fg: "#2F3DA8" },
};

export interface NarrativaItem {
  id: string;
  theme: string;
  platform: string | null;
  sentiment: string | null;
  strength: number;
  postsCount: number;
  status: string | null;
}

export interface NarrativasClientProps {
  kpis: { total: number; oportunidades: number; ameacas: number; sinaisRecentes: number };
  sentimentoPie: { name: string; value: number; fill: string }[];
  narrativas: NarrativaItem[];
}

export default function NarrativasClient({ kpis, sentimentoPie, narrativas }: NarrativasClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero eyebrow="Inteligência" titulo="Radar de Narrativas" subtitulo="Temas do debate público — oportunidades, ameaças e sentimento." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total de narrativas" valor={kpis.total} icone={MessageSquare} />
        <KpiCard label="Oportunidades" valor={kpis.oportunidades} icone={TrendingUp} />
        <KpiCard label="Ameaças" valor={kpis.ameacas} icone={AlertTriangle} />
        <KpiCard label="Sinais recentes (7d)" valor={kpis.sinaisRecentes} icone={Activity} />
      </section>

      {narrativas.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Nenhuma narrativa cadastrada"
          description="Cadastre a primeira narrativa para monitorar temas do debate público, identificar oportunidades e antecipar crises."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
          {sentimentoPie.length > 0 && <PieChartCard title="Distribuição de sentimento" data={sentimentoPie} />}

          <section className="space-y-3">
            {narrativas.map((n) => {
              const sen = SENTIMENTO[n.sentiment ?? "neutral"] ?? SENTIMENTO.neutral!;
              const st = STATUS[n.status ?? "monitoring"] ?? STATUS.monitoring!;
              return (
                <div
                  key={n.id}
                  className="wr-card p-5 transition-shadow duration-200 hover:shadow-md"
                  style={{ borderLeft: `4px solid ${sen.fg}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-snug">{n.theme}</h3>
                    <span className="shrink-0 font-heading text-lg font-bold tabular-nums">{Number(n.strength).toFixed(1)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: sen.bg, color: sen.fg }}>{sen.label}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                    {n.platform && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>
                        {n.platform.replace("_", " ")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{n.postsCount.toLocaleString("pt-BR")} posts</span>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}

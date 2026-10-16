"use client";

/**
 * Visual do painel de Adversários (War Room 2.0): KPIs, comparativo de ameaça
 * (BarChart) e cards com nível de ameaça (semáforo).
 *
 * pol_opponents não tem foto/partido/região — usamos avatar com iniciais,
 * plataforma, nível de ameaça, threat score e seguidores.
 */

import { Activity, AlertTriangle, ShieldAlert } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";

const RISCO: Record<string, { label: string; bg: string; fg: string }> = {
  low: { label: "Baixo", bg: "#E2F5EC", fg: "#17784F" },
  medium: { label: "Médio", bg: "#FCF1DC", fg: "#8A5A10" },
  high: { label: "Alto", bg: "#FDE8D4", fg: "#9A4A10" },
  critical: { label: "Crítico", bg: "#FBE4E2", fg: "#A3302A" },
};

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]?.[0] ?? "" : "")).toUpperCase() || "?";
}

export interface AdversarioItem {
  id: string;
  name: string;
  platform: string;
  username: string | null;
  riskLevel: string;
  threatScore: number;
  followers: number;
  active: boolean;
}

export interface AdversariosClientProps {
  kpis: { total: number; riscoAlto: number; sinaisAtivos: number };
  comparativo: { name: string; value: number; fill: string }[];
  adversarios: AdversarioItem[];
}

export default function AdversariosClient({ kpis, comparativo, adversarios }: AdversariosClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <SectionHeader title="Adversários" subtitle="Oposição monitorada — nível de ameaça, alcance e sinais de alerta." />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Adversários monitorados" valor={kpis.total} icone={ShieldAlert} />
        <KpiCard label="Risco alto / crítico" valor={kpis.riscoAlto} icone={AlertTriangle} />
        <KpiCard label="Sinais ativos (7d)" valor={kpis.sinaisAtivos} icone={Activity} />
      </section>

      {adversarios.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Nenhum adversário cadastrado"
          description="Cadastre o primeiro adversário para monitorar nível de ameaça, crescimento e sinais de alerta da oposição."
        />
      ) : (
        <>
          {comparativo.length > 0 && (
            <BarChartCard title="Comparativo de ameaça (threat score)" data={comparativo} horizontal height={320} />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adversarios.map((a) => {
              const r = RISCO[a.riskLevel] ?? RISCO.low!;
              return (
                <div key={a.id} className="wr-card flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #6B79DD 0%, #26318F 100%)" }}
                      aria-hidden
                    >
                      {iniciais(a.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{a.name}</div>
                      {a.username && <div className="truncate text-xs text-muted-foreground">@{a.username}</div>}
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: r.bg, color: r.fg }}>
                      {r.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>
                      {a.platform}
                    </span>
                    {!a.active && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>Inativo</span>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-sm" style={{ borderColor: "var(--color-border)" }}>
                    <span><span className="text-muted-foreground">Ameaça</span> <strong className="tabular-nums">{Number(a.threatScore).toFixed(1)}</strong></span>
                    <span><strong className="tabular-nums">{a.followers.toLocaleString("pt-BR")}</strong> <span className="text-muted-foreground">seguidores</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

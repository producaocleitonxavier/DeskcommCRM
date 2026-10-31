"use client";

/**
 * Visual do painel de Adversários (War Room 2.0): KPIs, comparativo de ameaça
 * (BarChart) e cards com nível de ameaça (semáforo).
 *
 * pol_opponents não tem foto/partido/região — usamos avatar com iniciais,
 * plataforma, nível de ameaça, threat score e seguidores.
 */

import { Activity, AlertTriangle, ShieldAlert, Vote, Newspaper, AtSign } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";
import type { DimensaoEleitoral } from "@/app/actions/politico/adversarios";

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
  eleitoral: DimensaoEleitoral | null;
}

export interface AdversariosClientProps {
  kpis: { total: number; riscoAlto: number; sinaisAtivos: number };
  comparativo: { name: string; value: number; fill: string }[];
  adversarios: AdversarioItem[];
}

export default function AdversariosClient({ kpis, comparativo, adversarios }: AdversariosClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero eyebrow="Inteligência" titulo="Adversários" subtitulo="Oposição monitorada em 3 frentes — força eleitoral (TSE), mídia e digital." />

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
            <BarChartCard title="Força eleitoral no município (votos — TSE)" data={comparativo} horizontal height={320} />
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
                  <div className="mt-auto space-y-1.5 border-t pt-2.5 text-xs" style={{ borderColor: "var(--color-border)" }}>
                    {/* Eleitoral (TSE) */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground"><Vote size={13} /> Eleitoral</span>
                      {a.eleitoral && a.eleitoral.votosMunicipio > 0 ? (
                        <span className="min-w-0 text-right">
                          <span>
                            <strong className="tabular-nums" style={{ color: "var(--color-text)" }}>{a.eleitoral.votosMunicipio.toLocaleString("pt-BR")}</strong> votos
                            {a.eleitoral.statusLabel && (
                              <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase" style={{ background: "#FDEBE9", color: "#A3302A" }}>{a.eleitoral.statusLabel}</span>
                            )}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">{[a.eleitoral.cargo, a.eleitoral.ano].filter(Boolean).join(" ")}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">sem histórico</span>
                      )}
                    </div>
                    {/* Mídia */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><Newspaper size={13} /> Mídia</span>
                      <span><strong className="tabular-nums" style={{ color: "var(--color-text)" }}>{Math.round(a.threatScore)}</strong> <span className="text-muted-foreground">sinais</span></span>
                    </div>
                    {/* Digital */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><AtSign size={13} /> Digital</span>
                      {a.followers > 0
                        ? <span><strong className="tabular-nums" style={{ color: "var(--color-text)" }}>{a.followers.toLocaleString("pt-BR")}</strong> <span className="text-muted-foreground">seguidores</span></span>
                        : <span className="text-muted-foreground">{a.username ? "aguardando" : "—"}</span>}
                    </div>
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

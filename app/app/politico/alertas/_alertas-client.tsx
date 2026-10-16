"use client";

/**
 * Corpo visual da Central de Alertas (War Room 2.0): filtros (status/severidade/
 * tipo via URL) e cards com borda por prioridade. O botão "Resolver" chama
 * PATCH /api/v1/pol-alerts/{id} — endpoint ainda não existe, então degrada com
 * mensagem de erro até o backend ser adicionado.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, Bell, Info, Loader2 } from "lucide-react";

import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";
import type { Alerta } from "./page";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  acknowledged: "Reconhecido",
  investigating: "Investigando",
  resolved: "Resolvido",
  dismissed: "Descartado",
};

const SEVERITY_LABELS: Record<string, string> = {
  info: "Info",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  critical: "Crítico",
};

const TYPE_LABELS: Record<string, string> = {
  sentiment: "Sentimento",
  engagement: "Engajamento",
  crisis: "Crise",
  opponent: "Adversário",
  territory: "Território",
  fake_news: "Fake News",
  growth: "Crescimento",
  momentum: "Momentum",
  media: "Mídia",
  survey: "Pesquisa",
  custom: "Personalizado",
};

const SEVERIDADE = {
  critical: { border: "#EF4444", badge: { bg: "#FBE4E2", fg: "#A3302A" }, icon: AlertOctagon },
  high: { border: "#F59E0B", badge: { bg: "#FCF1DC", fg: "#8A5A10" }, icon: AlertTriangle },
  medium: { border: "#3B82F6", badge: { bg: "#E4E7F8", fg: "#2F3DA8" }, icon: Info },
  low: { border: "#6B7280", badge: { bg: "#F0F0EB", fg: "#5B606B" }, icon: Info },
  info: { border: "#6B7280", badge: { bg: "#F0F0EB", fg: "#5B606B" }, icon: Info },
} as const;

const STATUS_ATIVOS = ["open", "acknowledged", "investigating"];

function sevConfig(severity: string) {
  return SEVERIDADE[severity as keyof typeof SEVERIDADE] ?? SEVERIDADE.info;
}

function tempoRelativo(data: string): string {
  const diffMin = Math.floor((Date.now() - new Date(data).getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `há ${diffD} ${diffD === 1 ? "dia" : "dias"}`;
  return `há ${Math.floor(diffD / 30)} meses`;
}

interface Filtros {
  status: string;
  severity: string;
  tipo: string;
}

export interface AlertasClientProps {
  alertas: Alerta[];
  filtros: Filtros;
  criticosAtivos: number;
}

export default function AlertasClient({ alertas, filtros, criticosAtivos }: AlertasClientProps) {
  const router = useRouter();
  const [pendentes, setPendentes] = useState<Record<string, boolean>>({});
  const [erros, setErros] = useState<Record<string, string>>({});

  function href(overrides: Partial<Filtros>): string {
    const merged = { ...filtros, ...overrides };
    const q = new URLSearchParams();
    if (merged.status) q.set("status", merged.status);
    if (merged.severity) q.set("severity", merged.severity);
    if (merged.tipo) q.set("tipo", merged.tipo);
    const s = q.toString();
    return `/app/politico/alertas${s ? `?${s}` : ""}`;
  }

  async function resolver(id: string) {
    setPendentes((p) => ({ ...p, [id]: true }));
    setErros((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/v1/pol-alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message ?? `Não foi possível resolver (HTTP ${res.status}).`);
      }
      router.refresh();
    } catch (e) {
      setErros((x) => ({ ...x, [id]: e instanceof Error ? e.message : "Erro ao resolver." }));
    } finally {
      setPendentes((p) => ({ ...p, [id]: false }));
    }
  }

  function Pill({ ativo, children, alvo }: { ativo: boolean; children: React.ReactNode; alvo: string }) {
    return (
      <Link
        href={alvo}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
        style={
          ativo
            ? { background: "#16181D", color: "#FFFFFF", borderColor: "#16181D" }
            : { background: "var(--color-surface)", color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
        }
      >
        {children}
      </Link>
    );
  }

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader title="Central de Alertas" subtitle="Sentimento, adversários, crises e fake news." />
        {criticosAtivos > 0 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "#FBE4E2", color: "#A3302A" }}
          >
            <AlertOctagon className="h-3.5 w-3.5" aria-hidden />
            {criticosAtivos} {criticosAtivos === 1 ? "crítico ativo" : "críticos ativos"}
          </span>
        )}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────── */}
      <div className="wr-card space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Status:</span>
          <Pill ativo={!filtros.status} alvo={href({ status: "" })}>Todos</Pill>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <Pill key={v} ativo={filtros.status === v} alvo={href({ status: filtros.status === v ? "" : v })}>{l}</Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Prioridade:</span>
          <Pill ativo={!filtros.severity} alvo={href({ severity: "" })}>Todas</Pill>
          {Object.entries(SEVERITY_LABELS).map(([v, l]) => (
            <Pill key={v} ativo={filtros.severity === v} alvo={href({ severity: filtros.severity === v ? "" : v })}>
              <span className="h-2 w-2 rounded-full" style={{ background: sevConfig(v).border }} aria-hidden />
              {l}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Tipo:</span>
          <Pill ativo={!filtros.tipo} alvo={href({ tipo: "" })}>Todos</Pill>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <Pill key={v} ativo={filtros.tipo === v} alvo={href({ tipo: filtros.tipo === v ? "" : v })}>{l}</Pill>
          ))}
        </div>
      </div>

      {/* ── Lista ───────────────────────────────────────────────── */}
      {alertas.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nenhum alerta por aqui"
          description={
            filtros.status || filtros.severity || filtros.tipo
              ? "Nenhum alerta para os filtros atuais."
              : "Tudo tranquilo — nenhum alerta ativo. O monitoramento segue de olho pra você."
          }
        />
      ) : (
        <div className="space-y-3">
          {alertas.map((a) => {
            const cfg = sevConfig(a.severity);
            const Icone = cfg.icon;
            const ativo = STATUS_ATIVOS.includes(a.status);
            return (
              <div
                key={a.id}
                className="wr-card p-5 transition-shadow duration-200 hover:shadow-md"
                style={{ borderLeft: `4px solid ${cfg.border}` }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: cfg.badge.bg }}
                    aria-hidden
                  >
                    <Icone style={{ color: cfg.badge.fg, width: 18, height: 18 }} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: cfg.badge.bg, color: cfg.badge.fg }}
                      >
                        {SEVERITY_LABELS[a.severity] ?? a.severity}
                      </span>
                      {a.alert_type && (
                        <span className="text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>
                          {TYPE_LABELS[a.alert_type] ?? a.alert_type}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                        · {STATUS_LABELS[a.status] ?? a.status} · {tempoRelativo(a.created_at)}
                      </span>
                    </div>

                    <h2 className="mt-1 font-semibold leading-snug">{a.title}</h2>
                    {a.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{a.description}</p>
                    )}
                    {erros[a.id] && (
                      <p className="mt-1.5 text-xs" style={{ color: "#A3302A" }}>{erros[a.id]}</p>
                    )}
                  </div>

                  {ativo && (
                    <button
                      type="button"
                      onClick={() => resolver(a.id)}
                      disabled={pendentes[a.id]}
                      className="wr-btn shrink-0 text-sm disabled:opacity-60"
                    >
                      {pendentes[a.id] && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                      Resolver
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

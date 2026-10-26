"use client";

/**
 * Corpo visual do Funil Político (War Room 2.0): funil hero + conversões,
 * 3 KPIs e tabela de transições recentes. Client — recebe dados do server.
 */

import Link from "next/link";
import { ArrowRight, Clock, Target, TrendingUp } from "lucide-react";

import { FunnelBoard } from "@/components/politico/funnel-board";
import { KpiCard } from "@/components/politico/kpi-card";
import { CommandHero } from "@/components/politico/command-hero";
import type { TransicaoRow } from "./page";

const STAGES = [
  { value: "novo_cadastro", label: "Novo cadastro", hex: "#C9CEF3", badge: { bg: "#EEF0FB", fg: "#3B4280" } },
  { value: "simpatizante", label: "Simpatizante", hex: "#9AA5EA", badge: { bg: "#DDE1F7", fg: "#2F3DA8" } },
  { value: "apoiador", label: "Apoiador", hex: "#6B79DD", badge: { bg: "#B4BCF0", fg: "#1E2A80" } },
  { value: "militante", label: "Militante", hex: "#4352C4", badge: { bg: "#4352C4", fg: "#FFFFFF" } },
  { value: "voto_certo", label: "Voto certo", hex: "#26318F", badge: { bg: "#26318F", fg: "#FFFFFF" } },
] as const;

function stageDe(value: string) {
  return STAGES.find((s) => s.value === value);
}

function StageBadge({ value }: { value: string }) {
  const s = stageDe(value);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ background: s?.badge.bg ?? "#F0F0EB", color: s?.badge.fg ?? "#5B606B" }}
    >
      {s?.label ?? value}
    </span>
  );
}

const TEMPERATURAS = [
  { value: "frio", label: "Frios", emoji: "🧊", cor: "#60A5FA", dica: "ainda não interagiram" },
  { value: "morno", label: "Mornos", emoji: "🔥", cor: "#FB923C", dica: "já responderam ou receberam material" },
  { value: "quente", label: "Quentes", emoji: "⚡", cor: "#F87171", dica: "engajamento alto, prontos pra mobilizar" },
] as const;

export interface FunilClientProps {
  contagem: Record<string, number>;
  temperaturas: Record<string, number>;
  transicoes: TransicaoRow[];
  total: number;
  taxaAtivacao: number;
  taxaConversao: number;
  velocidadeDias: number;
}

export default function FunilClient({
  contagem,
  temperaturas,
  transicoes,
  total,
  taxaAtivacao,
  taxaConversao,
  velocidadeDias,
}: FunilClientProps) {
  const heroData = STAGES.map((s) => ({
    label: s.label,
    value: contagem[s.value] ?? 0,
    color: s.hex,
    href: `/app/politico/leads?etapa=${s.value}`,
  }));

  // Conversões entre níveis consecutivos.
  const conversoes = STAGES.slice(0, -1).map((s, i) => {
    const atual = contagem[s.value] ?? 0;
    const proximo = contagem[STAGES[i + 1]!.value] ?? 0;
    const pct = atual > 0 ? Math.round((proximo / atual) * 100) : 0;
    return { de: s.label, para: STAGES[i + 1]!.label, pct };
  });

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Comando · Funil"
        titulo="Funil Político"
        subtitulo={`${total.toLocaleString("pt-BR")} ${total === 1 ? "pessoa" : "pessoas"} no funil — de novo cadastro a voto certo.`}
        acoes={[{ href: "/app/politico/leads/novo", label: "+ Novo cadastro", primary: true }]}
      />

      {/* ── Funil hero + conversões ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="wr-card p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="font-heading text-base font-bold">Distribuição por estágio</h2>
            <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>clique num estágio para ver as pessoas →</span>
          </div>
          <FunnelBoard data={heroData} showConversion={false} />
        </section>

        <section className="wr-card p-6 sm:p-7">
          <h2 className="mb-4 font-heading text-base font-bold">Conversão entre níveis</h2>
          <div className="space-y-3">
            {conversoes.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
                  <span className="truncate">{c.de}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{c.para}</span>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                  style={{ background: "var(--color-accent-100)", color: "var(--color-accent-900)" }}
                >
                  {c.pct}%
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Temperatura (clicável → filtra as pessoas) ──────────── */}
      <section className="wr-card p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-bold">Temperatura da base</h2>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>o quanto cada pessoa já se aproximou</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TEMPERATURAS.map((t) => {
            const n = temperaturas[t.value] ?? 0;
            const share = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <Link
                key={t.value}
                href={`/app/politico/leads?temp=${t.value}`}
                className="wr-lift group rounded-xl border p-4 transition-colors"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                    <span className="text-lg">{t.emoji}</span> {t.label}
                  </span>
                  <span className="text-[11px] opacity-0 transition-opacity group-hover:opacity-70" style={{ color: "var(--color-accent)" }}>ver →</span>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="wr-kpi-value text-3xl leading-none" style={{ color: t.cor }}>{n.toLocaleString("pt-BR")}</span>
                  <span className="pb-0.5 text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{share}%</span>
                </div>
                {/* Barra proporcional */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(share, n > 0 ? 3 : 0)}%`, background: t.cor }} />
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>{t.dica}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Taxa de ativação" valor={taxaAtivacao} sufixo="%" icone={TrendingUp} />
        <KpiCard label="Taxa de conversão" valor={taxaConversao} sufixo="%" icone={Target} />
        <KpiCard label="Velocidade do funil" valor={velocidadeDias} sufixo="dias" icone={Clock} />
      </section>

      {/* ── Transições recentes ─────────────────────────────────── */}
      <section className="wr-card overflow-hidden p-0">
        <div className="px-6 py-4">
          <h2 className="font-heading text-base font-bold">Transições recentes</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Últimas {transicoes.length} mudanças de nível</p>
        </div>

        {transicoes.length === 0 ? (
          <div className="px-6 pb-10 pt-4 text-center text-sm text-muted-foreground">
            Nenhuma transição registrada ainda.
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10" style={{ background: "var(--color-surface-elevated)" }}>
                <tr>
                  {["Pessoa", "Movimento", "Data", "Operador"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-6 py-3 text-left text-[13px] font-medium"
                      style={{ color: "var(--color-text-subtle)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transicoes.map((t) => (
                  <tr
                    key={t.id}
                    className="transition-colors hover:bg-[var(--color-surface-elevated)]"
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <td className="px-6 py-3 font-medium">{t.contacts?.name ?? "Contato desconhecido"}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1.5">
                        <StageBadge value={t.from_stage} />
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
                        <StageBadge value={t.to_stage} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                      {new Date(t.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={
                          t.changed_by
                            ? { background: "#E4E7F8", color: "#2F3DA8" }
                            : { background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }
                        }
                      >
                        {t.changed_by ? "Manual" : "Sistema"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

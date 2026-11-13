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
import type { TransicaoRow, MultiplicadorRow } from "./page";

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
  multiplicadores: MultiplicadorRow[];
  transicoes: TransicaoRow[];
  total: number;
  taxaAtivacao: number;
  taxaConversao: number;
  velocidadeDias: number;
}

export default function FunilClient({
  contagem,
  temperaturas,
  multiplicadores,
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

  // Quanto da base JÁ CHEGOU a cada nível (nele ou acima). Antes a conta dividia
  // o nível seguinte pelo atual — são QUANTIDADES paradas em cada nível, não um
  // fluxo, então dava número impossível ("143%"). Esta conta nunca passa de 100%.
  const totalNiveis = STAGES.reduce((a, s) => a + (contagem[s.value] ?? 0), 0);
  const conversoes = STAGES.slice(1).map((s, i) => {
    const nesteOuAcima = STAGES.slice(i + 1).reduce((a, x) => a + (contagem[x.value] ?? 0), 0);
    const pct = totalNiveis > 0 ? Math.round((nesteOuAcima / totalNiveis) * 100) : 0;
    return { nivel: s.label, pessoas: nesteOuAcima, pct };
  });

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] px-4 py-7 space-y-6">
      <CommandHero
        eyebrow="Mobilização · Funil"
        titulo="Funil"
        subtitulo={`${total.toLocaleString("pt-BR")} ${total === 1 ? "pessoa" : "pessoas"} na base — de novo cadastro a voto certo.`}
      />

      {/* ── Funil hero + conversões ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="gip-glass p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="font-heading text-base font-bold">Quantas pessoas em cada nível</h2>
            <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>clique num nível para ver as pessoas →</span>
          </div>
          <FunnelBoard data={heroData} showConversion={false} />
        </section>

        <section className="gip-glass p-6 sm:p-7">
          <h2 className="font-heading text-base font-bold">Até onde a base chegou</h2>
          <p className="mb-4 mt-0.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>De cada 100 pessoas, quantas já estão neste nível ou acima.</p>
          <div className="space-y-3">
            {conversoes.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0" style={{ color: "var(--color-text-muted)" }}>
                  <span>{c.nivel} ou acima</span>
                  <span className="ml-1.5 text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>({c.pessoas.toLocaleString("pt-BR")})</span>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                  style={{ background: "color-mix(in srgb, var(--color-accent) 16%, transparent)", color: "var(--color-accent)", border: "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)" }}
                >
                  {c.pct}%
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Temperatura (clicável → filtra as pessoas) ──────────── */}
      <section className="gip-glass p-6 sm:p-7">
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
                  <span className="text-[11px] opacity-0 transition-opacity group-hover:opacity-70" style={{ color: "var(--accent-ink, var(--color-accent))" }}>ver →</span>
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
        <KpiCard label="Já se envolveram com o mandato" valor={taxaAtivacao} sufixo="%" icone={TrendingUp} />
        <KpiCard label="Já são voto certo" valor={Math.round(taxaConversao)} sufixo="%" icone={Target} />
        {velocidadeDias > 0 && <KpiCard label="Tempo médio para subir de nível" valor={velocidadeDias} sufixo="dias" icone={Clock} />}
      </section>

      {/* ── Multiplicadores (quem TROUXE gente — o ouro) ────────── */}
      <section className="gip-glass p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-bold">🏆 Multiplicadores</h2>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>quem mais traz e alcança gente</span>
        </div>
        {/* Explicador fixo: o cliente esquece como alguém "vira multiplicador". */}
        <div
          className="mb-4 rounded-xl p-3 text-[12.5px] leading-snug"
          style={{ background: "color-mix(in srgb, var(--color-text) 5%, transparent)", color: "var(--color-text-muted)" }}
        >
          <strong style={{ color: "var(--color-text)" }}>Como alguém vira multiplicador:</strong>{" "}
          <span className="whitespace-nowrap">① <strong style={{ color: "var(--color-text)" }}>indica</strong> alguém que se cadastra</span>{" "}
          <span style={{ color: "var(--color-text-subtle)" }}>(pelo código/QR pessoal — o ouro)</span>, ou{" "}
          <span className="whitespace-nowrap">② <strong style={{ color: "var(--color-text)" }}>compartilha o link pessoal</strong> de um vídeo</span>{" "}
          e a rede abre. O sistema conta sozinho.
        </div>
        {multiplicadores.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Ninguém indicou ainda. Quando alguém trouxer um novo cadastro, aparece aqui — o sinal mais forte de que a base está crescendo.
          </p>
        ) : (
          <ol className="space-y-2">
            {multiplicadores.map((m, i) => (
              <li key={m.contact_id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--color-surface)" }}>
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={
                    i === 0
                      ? { background: "#FACC15", color: "#14181F" }
                      : i === 1
                        ? { background: "#CBD5E1", color: "#14181F" }
                        : i === 2
                          ? { background: "#D9A066", color: "#14181F" }
                          : { background: "rgba(255,255,255,0.08)", color: "var(--color-text-muted)" }
                  }
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>{m.nome}</span>
                <span className="flex shrink-0 items-center gap-2 text-sm font-bold tabular-nums">
                  <span style={{ color: "var(--accent-ink, var(--color-accent))" }}>trouxe {m.trouxe}</span>
                  {m.alcancou > 0 && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}
                      title="Alcance estimado dos vídeos que compartilhou (cliques distintos)"
                    >
                      alcançou {m.alcancou}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Transições recentes ─────────────────────────────────── */}
      <section className="gip-glass overflow-hidden p-0">
        <div className="px-6 py-4">
          <h2 className="font-heading text-base font-bold">Quem mudou de nível</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{transicoes.length === 0 ? "Quando alguém subir de nível, aparece aqui." : `As ${transicoes.length} mudanças mais recentes`}</p>
        </div>

        {transicoes.length === 0 ? (
          <div className="px-6 pb-10 pt-4 text-center text-sm text-muted-foreground">
            Ninguém mudou de nível ainda.
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

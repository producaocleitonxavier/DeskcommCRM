"use client";

/**
 * Opinião Pública (escuta social). Dashboard: pulso de menções, sentimento,
 * origem, pautas quentes e feed ao vivo — alimentado pela imprensa (RSS) e, em
 * breve, comentários do Instagram (ManyChat). Configura os termos monitorados e
 * dispara a atualização. Espelha a lógica do SAM, no nosso território.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RadioTower, RefreshCw, Settings2, TrendingUp, TrendingDown, Minus, Flame, ExternalLink } from "lucide-react";

import {
  salvarConfigMonitor, atualizarMencoes,
  type MonitorConfig, type ResumoOpiniao, type Mencao,
} from "@/app/actions/politico/opiniaoPublica";

const SENT = {
  positivo: { label: "Positivo", cor: "#22C55E", bg: "rgba(34,197,94,0.14)" },
  neutro: { label: "Neutro", cor: "#9CA3AF", bg: "rgba(156,163,175,0.14)" },
  negativo: { label: "Negativo", cor: "#ef4444", bg: "rgba(239,68,68,0.14)" },
} as const;

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
function fmtData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function OpiniaoPublicaClient({ config, resumo, mencoes }: { config: MonitorConfig; resumo: ResumoOpiniao; mencoes: Mencao[] }) {
  const router = useRouter();
  const [cfgAberto, setCfgAberto] = useState(resumo.total === 0);
  const [nome, setNome] = useState(config.termosNome.join(", "));
  const [cidade, setCidade] = useState(config.cidade ?? "");
  const [bairros, setBairros] = useState(config.bairros.join(", "));
  const [temas, setTemas] = useState(config.temas.join(", "));
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const [atualizando, startAtualizar] = useTransition();

  const temConfig = config.termosNome.length > 0 || config.cidade || config.temas.length > 0;

  function salvar() {
    setMsg(null);
    const nova: MonitorConfig = {
      termosNome: nome.split(",").map((s) => s.trim()).filter(Boolean),
      cidade: cidade.trim() || null,
      bairros: bairros.split(",").map((s) => s.trim()).filter(Boolean),
      temas: temas.split(",").map((s) => s.trim()).filter(Boolean),
    };
    startSalvar(async () => {
      const r = await salvarConfigMonitor(nova);
      if (!r.ok) { setMsg(r.erro ?? "Falha ao salvar."); return; }
      setMsg("Monitoramento salvo.");
      router.refresh();
    });
  }

  function atualizar() {
    setMsg(null);
    startAtualizar(async () => {
      const r = await atualizarMencoes();
      if (!r.ok) { setMsg(r.erro ?? "Falha ao atualizar."); return; }
      setMsg(r.novas > 0 ? `${r.novas} novas menções captadas.` : "Nenhuma menção nova agora.");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-7 space-y-5">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(96,165,250,0.16)", color: "#60A5FA" }} aria-hidden>
            <RadioTower className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-heading text-[26px] font-bold leading-tight" style={{ color: "var(--color-text)" }}>Opinião Pública</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>O que falam do seu nome, da sua cidade e das suas pautas — com sentimento e pautas quentes.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCfgAberto((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            <Settings2 className="h-4 w-4" aria-hidden /> Termos
          </button>
          <button type="button" onClick={atualizar} disabled={atualizando || !temConfig} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: "#D7F36A", color: "#16181D" }}>
            <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} aria-hidden /> {atualizando ? "Buscando…" : "Atualizar menções"}
          </button>
        </div>
      </header>

      {msg && <div className="wr-card px-4 py-2.5 text-sm" style={{ color: "var(--color-text-muted)" }}>{msg}</div>}

      {/* Config de termos */}
      {cfgAberto && (
        <section className="wr-card p-5 space-y-4">
          <h2 className="text-sm font-bold" style={{ color: "var(--color-text)" }}>O que monitorar</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Nome(s) do candidato / mandato" hint="separe por vírgula">
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Cleiton Xavier, @cleitonxavier" className="wr-input w-full" />
            </Campo>
            <Campo label="Cidade" hint="base da operação">
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Belo Horizonte" className="wr-input w-full" />
            </Campo>
            <Campo label="Temas / pautas" hint="separe por vírgula">
              <input value={temas} onChange={(e) => setTemas(e.target.value)} placeholder="segurança, saúde, buraco, iluminação" className="wr-input w-full" />
            </Campo>
            <Campo label="Bairros de interesse" hint="separe por vírgula">
              <input value={bairros} onChange={(e) => setBairros(e.target.value)} placeholder="Centro, Trevo, Venda Nova" className="wr-input w-full" />
            </Campo>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={salvar} disabled={salvando} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: "#D7F36A", color: "#16181D" }}>{salvando ? "Salvando…" : "Salvar termos"}</button>
            <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Fase 1: imprensa (Google Notícias). Comentários do Instagram via ManyChat entram em seguida.</span>
          </div>
        </section>
      )}

      {resumo.total === 0 ? (
        <div className="wr-card p-8 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
          {temConfig ? 'Nenhuma menção ainda. Clique em "Atualizar menções" para captar a imprensa agora.' : "Configure os termos acima para começar a escutar."}
        </div>
      ) : (
        <>
          {/* KPIs + sentimento */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
            <div className="wr-card flex items-center gap-5 p-6">
              <DonutSentimento pos={resumo.positivos} neu={resumo.neutros} neg={resumo.negativos} />
              <div className="space-y-1.5">
                <Legenda cor={SENT.positivo.cor} label="Positivo" n={resumo.positivos} total={resumo.total} />
                <Legenda cor={SENT.neutro.cor} label="Neutro" n={resumo.neutros} total={resumo.total} />
                <Legenda cor={SENT.negativo.cor} label="Negativo" n={resumo.negativos} total={resumo.total} />
              </div>
            </div>
            <div className="wr-card p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: "var(--color-text)" }}>Pulso (últimos dias)</h2>
                <span className="text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{resumo.total} menções</span>
              </div>
              <PulsoBarras dados={resumo.porDia} />
            </div>
          </section>

          {/* Pautas quentes + origem */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="wr-card p-5">
              <div className="mb-3 flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--color-text)" }}><Flame className="h-4 w-4" style={{ color: "#F59E0B" }} aria-hidden /> Pautas quentes</div>
              {resumo.topicos.length === 0 ? <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Classificando…</p> : (
                <ul className="space-y-2">
                  {resumo.topicos.map((t) => {
                    const neg = t.polaridadeMedia < -0.15; const pos = t.polaridadeMedia > 0.15;
                    const cor = neg ? SENT.negativo.cor : pos ? SENT.positivo.cor : SENT.neutro.cor;
                    const Icone = neg ? TrendingDown : pos ? TrendingUp : Minus;
                    return (
                      <li key={t.topico} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--color-text)" }}>
                          <Icone className="h-3.5 w-3.5" style={{ color: cor }} aria-hidden /> {t.topico}
                        </span>
                        <span className="text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{t.total}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="wr-card p-5">
              <div className="mb-3 text-sm font-bold" style={{ color: "var(--color-text)" }}>Origem das menções</div>
              <ul className="space-y-2">
                {resumo.porCanal.map((c) => (
                  <li key={c.canal} className="flex items-center justify-between gap-2">
                    <span className="text-sm capitalize" style={{ color: "var(--color-text)" }}>{c.canal}</span>
                    <span className="text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{c.total} · {pct(c.total, resumo.total)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Feed ao vivo */}
          <section className="wr-card p-5">
            <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--color-text)" }}>Menções recentes</h2>
            <ul className="space-y-2.5">
              {mencoes.map((m) => {
                const s = SENT[(m.sentimento as keyof typeof SENT)] ?? SENT.neutro;
                return (
                  <li key={m.id} className="flex items-start gap-3 rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)" }}>
                    <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: s.bg, color: s.cor }}>{s.label}</span>
                    <div className="min-w-0 flex-1">
                      <a href={m.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1 text-sm font-medium hover:opacity-70" style={{ color: "var(--color-text)" }}>
                        <span className="min-w-0">{m.titulo}</span>
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
                      </a>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                        {m.fonte && <span>{m.fonte}</span>}
                        {m.topico && <span>· {m.topico}</span>}
                        {m.bairro && <span>· {m.bairro}</span>}
                        <span>· {fmtData(m.publicadoEm)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>{label}{hint ? <span style={{ opacity: 0.7 }}> · {hint}</span> : null}</span>
      {children}
    </label>
  );
}

function Legenda({ cor, label, n, total }: { cor: string; label: string; n: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: cor }} aria-hidden />
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span className="tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>{n}</span>
      <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>({pct(n, total)}%)</span>
    </div>
  );
}

function DonutSentimento({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg || 1;
  const r = 52, c = 2 * Math.PI * r, size = 128, sw = 16;
  const segs = [
    { v: pos, cor: SENT.positivo.cor },
    { v: neu, cor: SENT.neutro.cor },
    { v: neg, cor: SENT.negativo.cor },
  ];
  let off = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
        {segs.map((s, i) => {
          const len = (s.v / total) * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.cor} strokeWidth={sw}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
          off += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-2xl font-bold" style={{ color: "var(--color-text)" }}>{pct(pos, total)}%</span>
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>positivo</span>
      </div>
    </div>
  );
}

function PulsoBarras({ dados }: { dados: { dia: string; total: number; pos: number; neg: number }[] }) {
  if (dados.length === 0) return <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Sem série ainda.</p>;
  const max = Math.max(...dados.map((d) => d.total), 1);
  return (
    <div className="flex h-[120px] items-end gap-1.5">
      {dados.map((d) => {
        const h = Math.max(4, (d.total / max) * 108);
        const hNeg = d.total > 0 ? (d.neg / d.total) * h : 0;
        const hPos = d.total > 0 ? (d.pos / d.total) * h : 0;
        return (
          <div key={d.dia} className="flex flex-1 flex-col items-center gap-1" title={`${d.dia}: ${d.total} menções`}>
            <div className="flex w-full flex-col justify-end overflow-hidden rounded-sm" style={{ height: h, background: SENT.neutro.cor }}>
              <div style={{ height: hNeg, background: SENT.negativo.cor }} />
              <div style={{ height: hPos, background: SENT.positivo.cor, marginTop: "auto" }} />
            </div>
            <span className="text-[9px]" style={{ color: "var(--color-text-subtle)" }}>{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</span>
          </div>
        );
      })}
    </div>
  );
}

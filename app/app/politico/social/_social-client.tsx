"use client";

/**
 * Opinião Pública (escuta social) — GIP. Dashboard: índice de sentimento, pulso
 * no tempo, pautas quentes, origem e feed ao vivo. Alimentado pela imprensa
 * (Google Notícias RSS) e, em breve, comentários do Instagram (ManyChat).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RadioTower, RefreshCw, Settings2, TrendingUp, TrendingDown, Minus, Flame, ExternalLink, Sparkles } from "lucide-react";

import {
  salvarConfigMonitor, atualizarMencoes, reavaliarSentimento,
  type MonitorConfig, type ResumoOpiniao, type Mencao,
} from "@/app/actions/politico/opiniaoPublica";

const SENT = {
  positivo: { label: "Positivo", cor: "#22C55E", bg: "rgba(34,197,94,0.14)" },
  neutro: { label: "Neutro", cor: "#9CA3AF", bg: "rgba(156,163,175,0.14)" },
  negativo: { label: "Negativo", cor: "#F87171", bg: "rgba(248,113,113,0.14)" },
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
  const [reav, startReav] = useTransition();

  const temConfig = config.termosNome.length > 0 || !!config.cidade || config.temas.length > 0;
  const net = resumo.total > 0 ? Math.round(((resumo.positivos - resumo.negativos) / resumo.total) * 100) : 0;
  const netCor = net > 10 ? SENT.positivo.cor : net < -10 ? SENT.negativo.cor : SENT.neutro.cor;
  const leitura =
    resumo.total === 0 ? ""
    : net < -10 ? "Tom negativo em alta — as dores da cidade dominam a pauta. Oportunidade de resposta."
    : net > 10 ? "Clima favorável — conquistas e avanços em destaque. Momento de capitalizar."
    : "Clima majoritariamente neutro — cobertura factual, sem carga forte.";

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
      setMsg(r.ok ? "Monitoramento salvo." : r.erro ?? "Falha ao salvar.");
      if (r.ok) router.refresh();
    });
  }
  function atualizar() {
    setMsg(null);
    startAtualizar(async () => {
      const r = await atualizarMencoes();
      setMsg(r.ok ? (r.novas > 0 ? `${r.novas} novas menções captadas.` : "Nenhuma menção nova agora.") : r.erro ?? "Falha.");
      if (r.ok) router.refresh();
    });
  }
  function reavaliar() {
    setMsg(null);
    startReav(async () => {
      const r = await reavaliarSentimento();
      setMsg(r.ok ? `Sentimento reavaliado em ${r.n} menções.` : r.erro ?? "Falha.");
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-7 space-y-4">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(96,165,250,0.16)", color: "#60A5FA" }} aria-hidden>
            <RadioTower className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-[26px] font-bold leading-tight" style={{ color: "var(--color-text)" }}>Opinião Pública</h1>
              {resumo.total > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "rgba(34,197,94,0.14)", color: "#22C55E" }}>
                  <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "#22C55E" }} /><span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "#22C55E" }} /></span>
                  ao vivo
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>O que falam do seu nome, da sua cidade e das suas pautas.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCfgAberto((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            <Settings2 className="h-4 w-4" aria-hidden /> Termos
          </button>
          <button type="button" onClick={atualizar} disabled={atualizando || !temConfig} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: "#D7F36A", color: "#16181D" }}>
            <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin" : ""}`} aria-hidden /> {atualizando ? "Buscando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {msg && <div className="wr-card px-4 py-2.5 text-sm" style={{ color: "var(--color-text-muted)" }}>{msg}</div>}

      {/* Config de termos */}
      {cfgAberto && (
        <section className="wr-card p-5 space-y-4">
          <h2 className="text-sm font-bold" style={{ color: "var(--color-text)" }}>O que monitorar</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Nome(s) do candidato / mandato" hint="separe por vírgula"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Cleiton Xavier, @cleitonxavier" className="wr-input w-full" /></Campo>
            <Campo label="Cidade" hint="base da operação"><input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Belo Horizonte" className="wr-input w-full" /></Campo>
            <Campo label="Temas / pautas" hint="separe por vírgula"><input value={temas} onChange={(e) => setTemas(e.target.value)} placeholder="segurança, saúde, buraco, iluminação" className="wr-input w-full" /></Campo>
            <Campo label="Bairros de interesse" hint="separe por vírgula"><input value={bairros} onChange={(e) => setBairros(e.target.value)} placeholder="Centro, Trevo, Venda Nova" className="wr-input w-full" /></Campo>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={salvar} disabled={salvando} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: "#D7F36A", color: "#16181D" }}>{salvando ? "Salvando…" : "Salvar termos"}</button>
            <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Por enquanto captamos a imprensa (Google Notícias). Os comentários do Instagram entram em breve.</span>
          </div>
        </section>
      )}

      {resumo.total === 0 ? (
        <div className="wr-card p-10 text-center">
          <RadioTower className="mx-auto h-8 w-8" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-subtle)" }}>
            {temConfig ? 'Nenhuma menção ainda. Clique em "Atualizar" para captar a imprensa agora.' : "Configure os termos acima para começar a escutar."}
          </p>
        </div>
      ) : (
        <>
          {/* HERO de sentimento */}
          <section className="wr-card overflow-hidden p-0">
            <div className="grid grid-cols-1 gap-0 md:grid-cols-[320px_1fr]">
              {/* Índice */}
              <div className="flex flex-col justify-center gap-3 p-6" style={{ background: "linear-gradient(145deg, rgba(215,243,106,0.06), transparent)", borderRight: "1px solid var(--color-border)" }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--color-text-subtle)" }}>Índice de sentimento</span>
                <div className="flex items-end gap-2">
                  <span className="font-heading text-5xl font-bold leading-none tabular-nums" style={{ color: netCor }}>{net > 0 ? `+${net}` : net}</span>
                  <span className="mb-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>de −100 a +100</span>
                </div>
                {/* barra de proporção */}
                <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div style={{ width: `${pct(resumo.positivos, resumo.total)}%`, background: SENT.positivo.cor }} />
                  <div style={{ width: `${pct(resumo.neutros, resumo.total)}%`, background: SENT.neutro.cor }} />
                  <div style={{ width: `${pct(resumo.negativos, resumo.total)}%`, background: SENT.negativo.cor }} />
                </div>
                <p className="text-xs leading-snug" style={{ color: "var(--color-text-muted)" }}>{leitura}</p>
              </div>
              {/* Tiles + ações */}
              <div className="flex flex-col gap-3 p-6">
                <div className="grid grid-cols-3 gap-3">
                  <StatSent tipo="positivo" n={resumo.positivos} total={resumo.total} icone={<TrendingUp className="h-3.5 w-3.5" aria-hidden />} />
                  <StatSent tipo="neutro" n={resumo.neutros} total={resumo.total} icone={<Minus className="h-3.5 w-3.5" aria-hidden />} />
                  <StatSent tipo="negativo" n={resumo.negativos} total={resumo.total} icone={<TrendingDown className="h-3.5 w-3.5" aria-hidden />} />
                </div>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}><strong style={{ color: "var(--color-text)" }}>{resumo.total}</strong> menções captadas</span>
                  <button type="button" onClick={reavaliar} disabled={reav} className="inline-flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50" style={{ color: "#60A5FA" }}>
                    <Sparkles className={`h-3.5 w-3.5 ${reav ? "animate-pulse" : ""}`} aria-hidden /> {reav ? "Reavaliando…" : "Reavaliar sentimento"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Pulso */}
          <section className="wr-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: "var(--color-text)" }}>Pulso da cobertura</h2>
              <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                <Leg cor={SENT.positivo.cor} t="positivo" /><Leg cor={SENT.neutro.cor} t="neutro" /><Leg cor={SENT.negativo.cor} t="negativo" />
              </div>
            </div>
            <PulsoBarras dados={resumo.porDia} />
          </section>

          {/* Pautas + origem */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div className="wr-card p-5 sm:col-span-3">
              <div className="mb-3 flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--color-text)" }}><Flame className="h-4 w-4" style={{ color: "#F59E0B" }} aria-hidden /> Pautas quentes</div>
              {resumo.topicos.length === 0 ? <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Classificando…</p> : (
                <div className="flex flex-col gap-2">
                  {resumo.topicos.map((t) => {
                    const neg = t.polaridadeMedia < -0.15, pos = t.polaridadeMedia > 0.15;
                    const cor = neg ? SENT.negativo.cor : pos ? SENT.positivo.cor : SENT.neutro.cor;
                    const Icone = neg ? TrendingDown : pos ? TrendingUp : Minus;
                    const w = Math.max(8, (t.total / resumo.topicos[0]!.total) * 100);
                    return (
                      <div key={t.topico} className="flex items-center gap-3">
                        <span className="flex w-28 shrink-0 items-center gap-1.5 text-sm capitalize" style={{ color: "var(--color-text)" }}><Icone className="h-3.5 w-3.5 shrink-0" style={{ color: cor }} aria-hidden />{t.topico}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}><div className="h-full rounded-full" style={{ width: `${w}%`, background: cor, opacity: 0.8 }} /></div>
                        <span className="w-6 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{t.total}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="wr-card p-5 sm:col-span-2">
              <div className="mb-3 text-sm font-bold" style={{ color: "var(--color-text)" }}>Origem</div>
              <div className="flex flex-col gap-2.5">
                {resumo.porCanal.map((c) => (
                  <div key={c.canal} className="flex items-center justify-between gap-2">
                    <span className="text-sm capitalize" style={{ color: "var(--color-text)" }}>{c.canal}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}><div className="h-full rounded-full" style={{ width: `${pct(c.total, resumo.total)}%`, background: "#60A5FA" }} /></div>
                      <span className="w-10 text-right text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{pct(c.total, resumo.total)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Feed */}
          <section className="wr-card p-5">
            <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--color-text)" }}>Menções recentes</h2>
            <ul className="flex flex-col gap-2">
              {mencoes.map((m) => {
                const s = SENT[(m.sentimento as keyof typeof SENT)] ?? SENT.neutro;
                const href = m.canal === "instagram" ? (m.autor ? `https://www.instagram.com/${m.autor}/` : null) : (m.url && m.url.startsWith("http") ? m.url : null);
                return (
                  <li key={m.id} className="overflow-hidden rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)" }}>
                    <div className="flex items-stretch">
                      <span className="w-1 shrink-0" style={{ background: s.cor }} aria-hidden />
                      <div className="min-w-0 flex-1 p-3">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1 text-sm font-medium hover:opacity-70" style={{ color: "var(--color-text)" }}>
                            <span className="min-w-0">{m.titulo}</span>
                            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
                          </a>
                        ) : (
                          <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{m.titulo}</span>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                          <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: s.bg, color: s.cor }}>{s.label}</span>
                          {m.topico && <span className="capitalize">{m.topico}</span>}
                          {m.fonte && <span>· {m.fonte}</span>}
                          {m.bairro && <span>· {m.bairro}</span>}
                          <span>· {fmtData(m.publicadoEm)}</span>
                        </div>
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
function Leg({ cor, t }: { cor: string; t: string }) {
  return <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: cor }} aria-hidden />{t}</span>;
}
function StatSent({ tipo, n, total, icone }: { tipo: keyof typeof SENT; n: number; total: number; icone: React.ReactNode }) {
  const s = SENT[tipo];
  return (
    <div className="rounded-xl p-3" style={{ background: s.bg, border: `1px solid ${s.cor}33` }}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: s.cor }}>{icone}{s.label}</div>
      <div className="mt-1 font-heading text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--color-text)" }}>{n}</div>
      <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{pct(n, total)}%</div>
    </div>
  );
}
function PulsoBarras({ dados }: { dados: { dia: string; total: number; pos: number; neg: number }[] }) {
  if (dados.length === 0) return <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Sem série ainda.</p>;
  const max = Math.max(...dados.map((d) => d.total), 1);
  return (
    <div className="flex h-[130px] items-end gap-2">
      {dados.map((d) => {
        const h = Math.max(6, (d.total / max) * 112);
        const neu = d.total - d.pos - d.neg;
        const seg = (v: number) => (d.total > 0 ? (v / d.total) * h : 0);
        return (
          <div key={d.dia} className="group flex flex-1 flex-col items-center gap-1.5" title={`${d.dia}: ${d.total} menções (${d.pos}+ / ${d.neg}−)`}>
            <div className="flex w-full max-w-[26px] flex-col justify-end overflow-hidden rounded-md transition-opacity group-hover:opacity-100" style={{ height: h, opacity: 0.9 }}>
              <div style={{ height: seg(d.neg), background: SENT.negativo.cor }} />
              <div style={{ height: seg(neu), background: SENT.neutro.cor }} />
              <div style={{ height: seg(d.pos), background: SENT.positivo.cor }} />
            </div>
            <span className="text-[9px]" style={{ color: "var(--color-text-subtle)" }}>{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</span>
          </div>
        );
      })}
    </div>
  );
}

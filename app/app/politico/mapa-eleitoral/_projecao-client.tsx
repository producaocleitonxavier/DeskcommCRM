"use client";

/**
 * Camada "Projeção" do Território (dado VIVO). Substitui a projeção legada
 * (pol_tse_data vazia). Para um município: por zona, cruza o UNIVERSO de votos
 * do cargo (TSE) com SUA BASE do CRM → cobertura e classificação estratégica
 * (Reduto / Consolidar / Oportunidade / Deserto). Didático de propósito: cada
 * número tem rótulo em português e a régua está escrita na tela.
 */

import { useState, useTransition } from "react";
import { Loader2, Info, TrendingUp, Sparkles } from "lucide-react";

import type { EleicaoOpcao } from "@/app/actions/politico/intelEleitoral";
import type { MunicipioOpcao } from "@/app/actions/politico/raioX";
import { projecaoZonal, type ProjecaoResumo, type ClasseZona } from "@/app/actions/politico/projecao";
import { analiseProjecaoIA } from "@/app/actions/politico/analiseProjecao";
import { MiniMarkdown } from "@/components/politico/mini-markdown";

const CLASSE: Record<ClasseZona, { label: string; bg: string; color: string; dica: string }> = {
  reduto: { label: "Reduto", bg: "rgba(23,120,79,0.18)", color: "#58C08A", dica: "Você é forte aqui — defenda a base." },
  consolidar: { label: "Consolidar", bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)", dica: "Presença média — reforce para virar reduto." },
  oportunidade: { label: "Oportunidade", bg: "rgba(215,243,106,0.16)", color: "#D7F36A", dica: "Muito voto e pouca presença sua — é onde crescer." },
  deserto: { label: "Deserto", bg: "rgba(163,48,42,0.16)", color: "#E08079", dica: "Zero base cadastrada num lugar que vota — território em branco." },
};

function pct(f: number): string {
  return `${(f * 100).toFixed(2)}%`;
}

export default function ProjecaoClient({ eleicoes, municipios }: { eleicoes: EleicaoOpcao[]; municipios: MunicipioOpcao[] }) {
  const [eleicaoId, setEleicaoId] = useState(eleicoes[0]!.id);
  const [munTse, setMunTse] = useState("");
  const [dados, setDados] = useState<ProjecaoResumo | null>(null);
  const [carregando, inicia] = useTransition();
  const [gerandoIA, setGerandoIA] = useState(false);
  const [analise, setAnalise] = useState<string | null>(null);
  const [analiseErro, setAnaliseErro] = useState<string | null>(null);
  const ano = eleicoes.find((e) => e.id === eleicaoId)?.ano ?? 0;
  const munNome = municipios.find((m) => m.tse === munTse)?.nome ?? "";

  function carregar(id: number, mun: string) {
    setAnalise(null); setAnaliseErro(null); // a leitura da IA vale para o estado anterior.
    if (!mun) { setDados(null); return; }
    const a = eleicoes.find((e) => e.id === id)?.ano ?? 0;
    inicia(async () => setDados(await projecaoZonal(id, mun, a)));
  }

  async function gerarAnalise() {
    setGerandoIA(true); setAnalise(null); setAnaliseErro(null);
    try {
      const r = await analiseProjecaoIA(eleicaoId, munTse, munNome, eleicoes.find((e) => e.id === eleicaoId)?.label ?? "", ano);
      if (r.ok) setAnalise(r.texto); else setAnaliseErro(r.erro);
    } catch {
      setAnaliseErro("Não consegui gerar agora. Tente novamente em instantes.");
    } finally {
      setGerandoIA(false);
    }
  }
  function trocarEleicao(id: number) { setEleicaoId(id); carregar(id, munTse); }
  function trocarMun(mun: string) { setMunTse(mun); carregar(eleicaoId, mun); }

  const maxUniverso = dados ? Math.max(1, ...dados.zonas.map((z) => z.universo)) : 1;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Eleição</span>
          <select value={eleicaoId} onChange={(e) => trocarEleicao(Number(e.target.value))} className="wr-input min-w-[220px]">
            {eleicoes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Município</span>
          <select value={munTse} onChange={(e) => trocarMun(e.target.value)} className="wr-input min-w-[220px]">
            <option value="">Selecione…</option>
            {municipios.map((m) => <option key={m.tse} value={m.tse}>{m.nome}</option>)}
          </select>
        </label>
        {carregando && <Loader2 className="mb-2 h-4 w-4 animate-spin" aria-hidden style={{ color: "rgba(255,255,255,0.6)" }} />}
      </div>

      {/* Explicação didática da régua */}
      <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden style={{ color: "#D7F36A" }} />
        <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
          <strong style={{ color: "#fff" }}>Como ler:</strong> <strong style={{ color: "#fff" }}>Universo</strong> = votos que o cargo teve na zona (o tamanho do mercado eleitoral ali).{" "}
          <strong style={{ color: "#fff" }}>Sua base</strong> = contatos do seu CRM mapeados naquela zona. <strong style={{ color: "#fff" }}>Cobertura</strong> = sua presença frente ao volume de voto.
          A <strong style={{ color: "#fff" }}>classificação</strong> aponta onde defender (Reduto), reforçar (Consolidar) e, principalmente, <strong style={{ color: "#D7F36A" }}>onde crescer</strong> (Oportunidade/Deserto: muito voto, pouca presença sua).
        </p>
      </div>

      {!munTse ? (
        <div className="wr-card p-10 text-center text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          Selecione um município para ver a projeção por zona.
        </div>
      ) : !dados || dados.zonas.length === 0 ? (
        <div className="wr-card p-10 text-center text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          {carregando ? "Carregando…" : "Sem dados de votação para esse município."}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Universo de votos" value={dados.universoTotal.toLocaleString("pt-BR")} sub={`cargo em ${munNome}`} />
            <Kpi label="Sua base (CRM)" value={dados.baseTotal.toLocaleString("pt-BR")} sub="contatos mapeados" accent="#D7F36A" />
            <Kpi label="Cobertura média" value={pct(dados.coberturaMedia)} sub="base / universo" />
            <Kpi label="Zonas" value={String(dados.zonas.length)} sub="no município" />
          </div>

          {/* Tabela por zona */}
          <section className="wr-card p-0">
            <div className="flex items-center gap-2 px-5 pt-4 pb-2">
              <TrendingUp className="h-4 w-4" aria-hidden style={{ color: "#D7F36A" }} />
              <h3 className="font-heading text-base font-bold" style={{ color: "#fff" }}>Projeção por zona — {munNome}</h3>
            </div>
            <div className="overflow-auto" style={{ maxHeight: 560 }}>
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10" style={{ background: "#1a1d24" }}>
                  <tr>
                    {["Zona", "Universo de votos", "Sua base", "Cobertura", "Classificação"].map((c, i) => (
                      <th key={c} className={`px-4 py-2.5 text-[12px] font-medium ${i === 0 ? "text-left" : i === 4 ? "text-left" : "text-right"}`}
                        style={{ color: "rgba(255,255,255,0.55)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.zonas.map((z) => {
                    const cl = CLASSE[z.classe];
                    return (
                      <tr key={z.zona} style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold" style={{ color: "#fff" }}>Zona {z.zona}</div>
                          {z.bairros.length > 0 && (
                            <div className="mt-0.5 text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.45)" }}>
                              {z.bairros.slice(0, 4).join(" · ")}{z.bairros.length > 4 ? ` +${z.bairros.length - 4}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right align-top tabular-nums">
                          <div className="font-bold" style={{ color: "#fff" }}>{z.universo.toLocaleString("pt-BR")}</div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                            <div className="h-full rounded-full" style={{ width: `${(z.universo / maxUniverso) * 100}%`, background: "#D7F36A" }} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right align-top tabular-nums font-semibold" style={{ color: z.base > 0 ? "#fff" : "rgba(255,255,255,0.4)" }}>
                          {z.base.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right align-top tabular-nums" style={{ color: "rgba(255,255,255,0.8)" }}>{pct(z.cobertura)}</td>
                        <td className="px-4 py-3 align-top">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: cl.bg, color: cl.color }}>{cl.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Legenda da régua */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {(Object.keys(CLASSE) as ClasseZona[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CLASSE[k].color }} aria-hidden />
                  <strong style={{ color: CLASSE[k].color }}>{CLASSE[k].label}:</strong> {CLASSE[k].dica}
                </span>
              ))}
            </div>
          </section>

          {/* Leitura estratégica (IA) — onde focar */}
          <section className="wr-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-5 w-5 shrink-0" style={{ color: "#D7F36A" }} aria-hidden />
                <div>
                  <h3 className="font-heading text-base font-bold" style={{ color: "#fff" }}>Leitura estratégica (IA)</h3>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>Onde focar em {munNome}: redutos a defender e oportunidades a conquistar.</p>
                </div>
              </div>
              <button type="button" onClick={gerarAnalise} disabled={gerandoIA}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-60"
                style={{ background: "#D7F36A", color: "#16181D" }}>
                {gerandoIA
                  ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Analisando…</>
                  : <><Sparkles className="h-4 w-4" aria-hidden /> {analise ? "Refazer análise" : "Gerar análise"}</>}
              </button>
            </div>
            {analiseErro && <p className="mt-3 text-sm" style={{ color: "#E08079" }}>{analiseErro}</p>}
            {analise && (
              <div className="mt-4 rounded-lg p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <MiniMarkdown texto={analise} />
                <p className="mt-3 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Gerado por IA a partir do universo de votos (TSE) e da sua base (CRM). Confira antes de decidir.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-[18px] p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</div>
      <div className="mt-0.5 font-heading text-[26px] font-bold tabular-nums" style={{ color: accent ?? "#fff" }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>{sub}</div>}
    </div>
  );
}

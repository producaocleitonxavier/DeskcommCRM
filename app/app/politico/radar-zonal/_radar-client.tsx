"use client";

/**
 * Radar Zonal (client). Eleição + município → ranking para escolher o candidato
 * → grid de zonas (votos + leads do CRM) → detalhe da zona (bairros, top locais).
 * Dados via server actions (RLS). Design próprio (dark tático + lime).
 */

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Loader2, MapPin, Search, Users } from "lucide-react";

import type { EleicaoOpcao } from "@/app/actions/politico/intelEleitoral";
import { CandFoto } from "@/components/politico/cand-foto";
import {
  rankingCandidatosMun,
  radarZonal,
  zonaLocais,
  type CandidatoRank,
  type MunicipioOpcao,
  type ZonaRadar,
  type ZonaLocal,
} from "@/app/actions/politico/raioX";

// Faixa de força por votos (relativo ao topo da zona).
function faixa(v: number, max: number): { cor: string; label: string } {
  const r = max > 0 ? v / max : 0;
  if (r >= 0.6) return { cor: "#22c55e", label: "Base forte" };
  if (r >= 0.3) return { cor: "#84cc16", label: "Base média" };
  if (r >= 0.12) return { cor: "#d09455", label: "Em crescimento" };
  return { cor: "#7da9bf", label: "Em construção" };
}

export default function RadarClient({ eleicoes, municipios }: { eleicoes: EleicaoOpcao[]; municipios: MunicipioOpcao[] }) {
  const [eleicaoId, setEleicaoId] = useState(eleicoes[0]!.id);
  const [munTse, setMunTse] = useState("");
  const [q, setQ] = useState("");
  const [ranking, setRanking] = useState<CandidatoRank[]>([]);
  const [cand, setCand] = useState<CandidatoRank | null>(null);
  const [zonas, setZonas] = useState<ZonaRadar[]>([]);
  const [zonaSel, setZonaSel] = useState<number | null>(null);
  const [locais, setLocais] = useState<ZonaLocal[]>([]);
  const [carregando, inicia] = useTransition();
  const eleicaoAno = eleicoes.find((e) => e.id === eleicaoId)?.ano ?? 0;

  function carregarRanking(id: number, mun: string, termo: string) {
    if (!mun) { setRanking([]); return; }
    inicia(async () => setRanking(await rankingCandidatosMun(id, mun, termo, 60)));
  }
  function trocarEleicao(id: number) { setEleicaoId(id); voltar(); carregarRanking(id, munTse, q.trim()); }
  function trocarMun(mun: string) { setMunTse(mun); voltar(); carregarRanking(eleicaoId, mun, q.trim()); }

  function abrir(c: CandidatoRank) {
    setCand(c); setZonaSel(null); setLocais([]);
    inicia(async () => setZonas(await radarZonal(eleicaoId, c.sq, munTse, eleicaoAno)));
  }
  function abrirZona(z: number) {
    setZonaSel(z);
    inicia(async () => setLocais(await zonaLocais(eleicaoId, cand!.sq, munTse, z)));
  }
  function voltar() { setCand(null); setZonas([]); setZonaSel(null); setLocais([]); }

  const maxVotos = useMemo(() => Math.max(...zonas.map((z) => z.votos), 1), [zonas]);
  const totVotos = zonas.reduce((s, z) => s + z.votos, 0);
  const totLeads = zonas.reduce((s, z) => s + z.leads, 0);
  const topZona = zonas[0];
  const munNome = municipios.find((m) => m.tse === munTse)?.nome ?? "";
  const zonaAtual = zonas.find((z) => z.zona === zonaSel);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Eleição</span>
          <select value={eleicaoId} onChange={(e) => trocarEleicao(Number(e.target.value))} className="wr-input min-w-[200px]">
            {eleicoes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Município</span>
          <select value={munTse} onChange={(e) => trocarMun(e.target.value)} className="wr-input min-w-[200px]">
            <option value="">Selecione…</option>
            {municipios.map((m) => <option key={m.tse} value={m.tse}>{m.nome}</option>)}
          </select>
        </label>
        {munTse && !cand && (
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Buscar candidato</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
              <input value={q} onChange={(e) => { setQ(e.target.value); carregarRanking(eleicaoId, munTse, e.target.value.trim()); }} placeholder="Nome ou número" className="wr-input w-full pl-9" />
            </div>
          </label>
        )}
        {carregando && <Loader2 className="mb-2 h-4 w-4 animate-spin" aria-hidden style={{ color: "var(--color-text-subtle)" }} />}
      </div>

      {!munTse ? (
        <div className="wr-card p-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
          Selecione um município para abrir o radar.
        </div>
      ) : !cand ? (
        /* Escolher candidato */
        <section className="wr-card overflow-hidden p-0">
          <div className="px-5 pt-4 pb-2">
            <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Candidatos — {munNome}</h3>
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Clique para abrir o radar por zona</p>
          </div>
          <ul className="max-h-[560px] overflow-y-auto">
            {ranking.map((c) => (
              <li key={c.sq}>
                <button type="button" onClick={() => abrir(c)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[rgba(0,0,0,0.03)]" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{c.posicao}</span>
                  <CandFoto sq={c.sq} ano={eleicaoAno} nome={c.nomeUrna} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>{c.nomeUrna}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{c.nr}{c.partido ? ` · ${c.partido}` : ""} · {c.votos.toLocaleString("pt-BR")} votos</div>
                  </div>
                </button>
              </li>
            ))}
            {ranking.length === 0 && <li className="p-8 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>{carregando ? "Carregando…" : "Nenhum candidato."}</li>}
          </ul>
        </section>
      ) : (
        /* Radar */
        <div className="space-y-4">
          <button type="button" onClick={voltar} className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Trocar candidato
          </button>

          {/* Cabeçalho */}
          <header className="wr-card overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7" style={{ background: "linear-gradient(135deg,#0E1116 0%,#14181F 55%,#1A2410 100%)" }}>
              <div className="flex items-center gap-4">
                <div style={{ border: "2px solid rgba(215,243,106,0.35)", borderRadius: "9999px" }}>
                  <CandFoto sq={cand.sq} ano={eleicaoAno} nome={cand.nomeUrna} size={56} />
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#D7F36A" }}>{munNome} · {zonas.length} zonas</div>
                  <h2 className="font-heading text-2xl font-bold leading-tight" style={{ color: "#FFFFFF" }}>{cand.nomeUrna}</h2>
                  <div className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>nº {cand.nr}{cand.partido ? ` · ${cand.partido}` : ""}</div>
                </div>
              </div>
              <div className="flex gap-6">
                <Kpi valor={totVotos.toLocaleString("pt-BR")} label="votos no município" cor="#D7F36A" />
                <Kpi valor={topZona ? `Zona ${topZona.zona}` : "—"} label="zona líder" cor="#FFFFFF" />
                <Kpi valor={totLeads.toLocaleString("pt-BR")} label="leads do CRM" cor="#84cc16" />
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* Grid de zonas */}
            <section className="wr-card p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Força por zona</h3>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  {[{ c: "#22c55e", l: "Forte" }, { c: "#84cc16", l: "Média" }, { c: "#d09455", l: "Crescimento" }, { c: "#7da9bf", l: "Construção" }].map((x) => (
                    <span key={x.l} className="inline-flex items-center gap-1" style={{ color: "var(--color-text-subtle)" }}><span className="inline-block h-2 w-2 rounded-sm" style={{ background: x.c }} /> {x.l}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {zonas.map((z) => {
                  const f = faixa(z.votos, maxVotos);
                  const ativa = z.zona === zonaSel;
                  return (
                    <button key={z.zona} type="button" onClick={() => abrirZona(z.zona)}
                      className="flex flex-col items-center rounded-xl p-2.5 text-center transition-all"
                      style={{ border: `1px solid ${ativa ? f.cor : "var(--color-border)"}`, background: ativa ? `${f.cor}14` : "var(--color-surface)", boxShadow: ativa ? `0 0 0 1px ${f.cor}` : undefined }}>
                      <span className="font-heading text-sm font-bold" style={{ color: f.cor }}>Zona {z.zona}</span>
                      <span className="text-base font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{z.votos.toLocaleString("pt-BR")}</span>
                      {z.leads > 0 && (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px]" style={{ color: "#5C7F23" }}>
                          <Users className="h-2.5 w-2.5" aria-hidden /> {z.leads}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Detalhe da zona */}
            <section className="wr-card flex flex-col p-0">
              {!zonaAtual ? (
                <div className="flex flex-1 items-center justify-center p-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
                  Clique numa zona para ver bairros, locais de votação e a sua base ali.
                </div>
              ) : (
                <div className="flex flex-col gap-4 p-5">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-heading text-lg font-bold" style={{ color: "var(--color-text)" }}>Zona {zonaAtual.zona}</h3>
                      <span className="text-sm font-bold tabular-nums" style={{ color: "#5C7F23" }}>{zonaAtual.votos.toLocaleString("pt-BR")} votos</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      <span>{totVotos > 0 ? ((zonaAtual.votos / totVotos) * 100).toFixed(1) : "0"}% dos votos no município</span>
                      <span className="inline-flex items-center gap-1" style={{ color: "#5C7F23" }}><Users className="h-3 w-3" aria-hidden /> {zonaAtual.leads} leads do CRM</span>
                    </div>
                  </div>

                  {/* Bairros */}
                  <div>
                    <h4 className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}><MapPin className="h-3 w-3" aria-hidden /> Bairros abrangidos ({zonaAtual.bairros.length})</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {zonaAtual.bairros.slice(0, 24).map((b) => (
                        <span key={b} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "rgba(215,243,106,0.12)", color: "var(--color-text)" }}>{b}</span>
                      ))}
                      {zonaAtual.bairros.length === 0 && <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Sem bairros mapeados.</span>}
                    </div>
                  </div>

                  {/* Top locais */}
                  <div>
                    <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Top locais de votação</h4>
                    <ul className="flex flex-col gap-1.5">
                      {locais.slice(0, 8).map((l, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate" style={{ color: "var(--color-text)" }}>{l.local}</div>
                            {l.bairro && <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{l.bairro}</div>}
                          </div>
                          <span className="shrink-0 font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{l.votos.toLocaleString("pt-BR")}</span>
                        </li>
                      ))}
                      {locais.length === 0 && <li className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{carregando ? "Carregando…" : "Sem locais."}</li>}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ valor, label, cor }: { valor: string; label: string; cor: string }) {
  return (
    <div className="text-right">
      <div className="font-heading text-2xl font-bold tabular-nums" style={{ color: cor }}>{valor}</div>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</div>
    </div>
  );
}

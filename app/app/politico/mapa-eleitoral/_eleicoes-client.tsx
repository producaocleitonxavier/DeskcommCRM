"use client";

/**
 * Camada "Mapa de Votos" do Território (Inteligência/TSE). Busca de candidato
 * (por nome ou número) + choropleth de MG pintado pela % do candidato por
 * município. Identifica o candidato por SQ (único) — o mapa por número somava
 * candidatos diferentes que repetem o número entre municípios.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Loader2, Search, X } from "lucide-react";

import { mapaMunicipioSq, type EleicaoOpcao, type MapaMunicipioPonto } from "@/app/actions/politico/intelEleitoral";
import { rankingCandidatos, type CandidatoRank } from "@/app/actions/politico/raioX";
import { CandFoto } from "@/components/politico/cand-foto";

const MapaChoropleth = dynamic(() => import("@/components/politico/mapa-choropleth"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[560px] w-full items-center justify-center rounded-2xl text-sm" style={{ background: "rgba(255,255,255,0.03)", color: "var(--color-text-subtle)" }}>
      Carregando mapa…
    </div>
  ),
});

export interface EleicoesClientProps {
  eleicoes: EleicaoOpcao[];
  eleicaoInicial: number;
  candidatoInicial: CandidatoRank | null;
  pontosIniciais: MapaMunicipioPonto[];
  nomes: Record<string, string>;
}

export default function EleicoesClient({ eleicoes, eleicaoInicial, candidatoInicial, pontosIniciais, nomes }: EleicoesClientProps) {
  const [eleicaoId, setEleicaoId] = useState(eleicaoInicial);
  const [cand, setCand] = useState<CandidatoRank | null>(candidatoInicial);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CandidatoRank[]>([]);
  const [aberto, setAberto] = useState(false);
  const [pontos, setPontos] = useState(pontosIniciais);
  const [carregando, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const ano = eleicoes.find((e) => e.id === eleicaoId)?.ano ?? 0;

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // resumo
  const comDados = pontos.filter((p) => p.total > 0);
  const vencidos = comDados.filter((p) => p.cand / p.total > 0.5).length;
  const totalCand = pontos.reduce((s, p) => s + p.cand, 0);
  const totalGeral = pontos.reduce((s, p) => s + p.total, 0);
  const shareGeral = totalGeral > 0 ? (totalCand / totalGeral) * 100 : 0;
  const comVoto = comDados.filter((p) => p.cand > 0).length;

  function trocarEleicao(id: number) {
    setEleicaoId(id);
    setQ(""); setResultados([]); setAberto(false);
    startTransition(async () => {
      const top = (await rankingCandidatos(id, "", 1))[0] ?? null;
      setCand(top);
      setPontos(top ? await mapaMunicipioSq(id, top.sq) : []);
    });
  }

  function buscar(termo: string) {
    setQ(termo);
    if (termo.trim().length < 2) { setResultados([]); setAberto(false); return; }
    setAberto(true);
    startTransition(async () => setResultados(await rankingCandidatos(eleicaoId, termo.trim(), 30)));
  }

  function escolher(c: CandidatoRank) {
    setCand(c);
    setQ(""); setResultados([]); setAberto(false);
    startTransition(async () => setPontos(await mapaMunicipioSq(eleicaoId, c.sq)));
  }

  return (
    <div className="space-y-4">
      {/* Seletores: eleição + busca de candidato */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Eleição</span>
          <select value={eleicaoId} onChange={(e) => trocarEleicao(Number(e.target.value))} className="wr-input min-w-[200px]">
            {eleicoes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>

        <div className="relative min-w-[300px] flex-1" ref={boxRef}>
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Candidato</span>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
            <input
              value={q}
              onChange={(e) => buscar(e.target.value)}
              onFocus={() => { if (resultados.length) setAberto(true); }}
              placeholder={cand ? `${cand.nomeUrna} — trocar candidato…` : "Buscar por nome ou número"}
              className="wr-input w-full pl-9"
            />
            {q && (
              <button type="button" onClick={() => { setQ(""); setResultados([]); setAberto(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="limpar">
                <X className="h-4 w-4" style={{ color: "var(--color-text-subtle)" }} />
              </button>
            )}
          </div>
          {aberto && (
            <ul className="absolute z-30 mt-1 max-h-[340px] w-full overflow-y-auto rounded-xl py-1 shadow-xl"
              style={{ background: "#1a1d24", border: "1px solid rgba(255,255,255,0.12)" }}>
              {resultados.map((c) => (
                <li key={c.sq}>
                  <button type="button" onClick={() => escolher(c)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.06)]">
                    <CandFoto sq={c.sq} ano={ano} nome={c.nomeUrna} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: "#fff" }}>{c.nomeUrna}</div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{c.nr}{c.partido ? ` · ${c.partido}` : ""} · {c.votos.toLocaleString("pt-BR")} votos</div>
                    </div>
                  </button>
                </li>
              ))}
              {resultados.length === 0 && (
                <li className="px-3 py-4 text-center text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {carregando ? "Buscando…" : "Nenhum candidato."}
                </li>
              )}
            </ul>
          )}
        </div>

        {carregando && (
          <span className="mb-2 inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> atualizando…
          </span>
        )}
      </div>

      {/* Candidato atual */}
      {cand && (
        <div className="flex items-center gap-3">
          <CandFoto sq={cand.sq} ano={ano} nome={cand.nomeUrna} size={40} />
          <div>
            <div className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>{cand.nomeUrna}</div>
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>nº {cand.nr}{cand.partido ? ` · ${cand.partido}` : ""}{cand.situacao ? ` · ${cand.situacao}` : ""}</div>
          </div>
        </div>
      )}

      {/* Resumo */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo label="Votos do candidato (MG)" valor={totalCand.toLocaleString("pt-BR")} />
        <Resumo label="% no estado" valor={`${shareGeral.toFixed(1)}%`} destaque />
        <Resumo label="Municípios vencidos (>50%)" valor={String(vencidos)} />
        <Resumo label="Municípios com voto" valor={comVoto.toLocaleString("pt-BR")} />
      </section>

      {/* Mapa */}
      <section className="wr-card p-3 sm:p-4">
        <MapaChoropleth pontos={pontos} nomes={nomes} candidatoNome={cand?.nomeUrna ?? ""} candidatoNr={cand?.sq ?? ""} />
      </section>
    </div>
  );
}

function Resumo({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="wr-card p-4">
      <div className="font-heading text-2xl font-bold tabular-nums" style={{ color: destaque ? "#5C7F23" : "var(--color-text)" }}>{valor}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</div>
    </div>
  );
}

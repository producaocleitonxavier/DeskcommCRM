"use client";

/**
 * Camada "Eleições" do Território (War Room 2.0 — Inteligência/TSE).
 * Seletor de eleição + candidato → choropleth de MG pintado pela % do
 * candidato por município. Dados via server actions (RLS pela sessão).
 */

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import {
  candidatosDaEleicao,
  mapaMunicipio,
  type EleicaoOpcao,
  type CandidatoOpcao,
  type MapaMunicipioPonto,
} from "@/app/actions/politico/intelEleitoral";

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
  candidatosIniciais: CandidatoOpcao[];
  candidatoInicial: string;
  pontosIniciais: MapaMunicipioPonto[];
  nomes: Record<string, string>;
}

export default function EleicoesClient({
  eleicoes,
  eleicaoInicial,
  candidatosIniciais,
  candidatoInicial,
  pontosIniciais,
  nomes,
}: EleicoesClientProps) {
  const [eleicaoId, setEleicaoId] = useState(eleicaoInicial);
  const [candidatos, setCandidatos] = useState(candidatosIniciais);
  const [candNr, setCandNr] = useState(candidatoInicial);
  const [pontos, setPontos] = useState(pontosIniciais);
  const [carregando, startTransition] = useTransition();

  const cand = candidatos.find((c) => c.nr === candNr);

  // resumo
  const comDados = pontos.filter((p) => p.total > 0);
  const vencidos = comDados.filter((p) => p.cand / p.total > 0.5).length;
  const totalCand = pontos.reduce((s, p) => s + p.cand, 0);
  const totalGeral = pontos.reduce((s, p) => s + p.total, 0);
  const shareGeral = totalGeral > 0 ? (totalCand / totalGeral) * 100 : 0;

  function trocarEleicao(id: number) {
    setEleicaoId(id);
    startTransition(async () => {
      const cands = await candidatosDaEleicao(id);
      setCandidatos(cands);
      const topNr = cands[0]?.nr ?? "";
      setCandNr(topNr);
      setPontos(topNr ? await mapaMunicipio(id, topNr) : []);
    });
  }

  function trocarCandidato(nr: string) {
    setCandNr(nr);
    startTransition(async () => {
      setPontos(await mapaMunicipio(eleicaoId, nr));
    });
  }

  return (
    <div className="space-y-4">
      {/* Seletores */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Eleição</span>
          <select
            value={eleicaoId}
            onChange={(e) => trocarEleicao(Number(e.target.value))}
            className="wr-input min-w-[200px]"
          >
            {eleicoes.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Candidato</span>
          <select
            value={candNr}
            onChange={(e) => trocarCandidato(e.target.value)}
            className="wr-input min-w-[260px]"
          >
            {candidatos.map((c) => (
              <option key={c.nr} value={c.nr}>
                {c.nr} · {c.nome} ({c.votos.toLocaleString("pt-BR")})
              </option>
            ))}
          </select>
        </label>
        {carregando && (
          <span className="mb-2 inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> atualizando…
          </span>
        )}
      </div>

      {/* Resumo */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo label="Votos do candidato (MG)" valor={totalCand.toLocaleString("pt-BR")} />
        <Resumo label="% no estado" valor={`${shareGeral.toFixed(1)}%`} destaque />
        <Resumo label="Municípios vencidos (>50%)" valor={String(vencidos)} />
        <Resumo label="Municípios com voto" valor={comDados.filter((p) => p.cand > 0).length.toLocaleString("pt-BR")} />
      </section>

      {/* Mapa */}
      <section className="wr-card p-3 sm:p-4">
        <MapaChoropleth
          pontos={pontos}
          nomes={nomes}
          candidatoNome={cand?.nome ?? ""}
          candidatoNr={candNr}
        />
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

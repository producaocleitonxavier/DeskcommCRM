"use client";

/**
 * Wrapper do MAPA DE CALOR DA BASE (cidades) para a página de Pessoas. Carrega o
 * choropleth via next/dynamic ssr:false (Leaflet usa window) e é RECOLHÍVEL — a
 * lista de Pessoas é densa, então o mapa abre por cima dos cards sem enterrá-los.
 * Mostra um resumo exato (contatos mapeados, nº de cidades, cidade líder e
 * quantos não foram localizados) mesmo recolhido.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, Map as MapIcon } from "lucide-react";

import type { BasePonto } from "./mapa-base-choropleth";

const MapaBaseChoropleth = dynamic(() => import("./mapa-base-choropleth"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[480px] w-full items-center justify-center rounded-2xl text-sm"
      style={{ background: "rgba(255,255,255,0.03)", color: "var(--color-text-subtle)" }}
    >
      Carregando mapa…
    </div>
  ),
});

export interface MapaBaseResumo {
  pontos: BasePonto[];
  mapeados: number;
  cidades: number;
  cidadeTop: string;
  naoLocalizados: number;
}

export default function MapaBaseHero({ resumo }: { resumo: MapaBaseResumo }) {
  const [aberto, setAberto] = useState(true);
  if (resumo.pontos.length === 0) return null;

  return (
    <section className="wr-card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "rgba(215,243,106,0.12)" }}
        >
          <MapIcon className="h-4 w-4" style={{ color: "#D7F36A" }} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
            Mapa de calor da base
          </span>
          <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
            {resumo.mapeados.toLocaleString("pt-BR")} contatos em {resumo.cidades.toLocaleString("pt-BR")} cidades
            {resumo.cidadeTop ? ` · ${resumo.cidadeTop} lidera` : ""}
            {resumo.naoLocalizados > 0 ? ` · ${resumo.naoLocalizados.toLocaleString("pt-BR")} sem cidade reconhecida` : ""}
          </span>
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 transition-transform"
          style={{ color: "var(--color-text-subtle)", transform: aberto ? "rotate(180deg)" : "none" }}
          aria-hidden
        />
      </button>
      {aberto && (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <MapaBaseChoropleth pontos={resumo.pontos} />
        </div>
      )}
    </section>
  );
}

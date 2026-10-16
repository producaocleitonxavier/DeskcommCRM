"use client";

/**
 * Wrapper client do mapa de calor. Carrega o Leaflet via next/dynamic com
 * ssr:false (depende de `window`) e exibe um placeholder enquanto monta.
 */

import dynamic from "next/dynamic";
import type { MapaPonto } from "./mapa-leaflet";

const MapaLeaflet = dynamic(() => import("./mapa-leaflet"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[460px] w-full items-center justify-center rounded-xl text-sm"
      style={{ background: "rgba(255,255,255,0.03)", color: "var(--color-text-subtle)" }}
    >
      Carregando mapa…
    </div>
  ),
});

export default function MapaEleitoralHero({ pontos }: { pontos: MapaPonto[] }) {
  if (pontos.length === 0) return null;
  return (
    <section className="wr-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
            Mapa de força
          </h2>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {pontos.length.toLocaleString("pt-BR")} cidades · alterne entre calor e bolhas no canto do mapa
          </p>
        </div>
      </div>
      <MapaLeaflet pontos={pontos} />
    </section>
  );
}

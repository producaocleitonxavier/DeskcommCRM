"use client";

/**
 * Choropleth eleitoral (War Room 2.0 — Inteligência/TSE). Pinta os municípios
 * de MG pela % de votos do candidato escolhido (cand/total do cargo). Fundo
 * Esri dark; malha municipal carregada de /geo/mg-municipios.geojson (feature
 * key = codarea IBGE). Client-only (Leaflet depende de window): importar via
 * next/dynamic ssr:false (ver mapa-choropleth-hero.tsx).
 */

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";

export interface ChoroplethPonto {
  ibge: string;
  cand: number;
  total: number;
}

export interface MapaChoroplethProps {
  pontos: ChoroplethPonto[];
  nomes: Record<string, string>;
  candidatoNome: string;
  candidatoNr: string;
}

// Buckets de share (% do candidato no município) → cor (rampa lime da marca).
const BUCKETS = [
  { min: 0.5, cor: "#D7F36A", label: "≥ 50%" },
  { min: 0.4, cor: "#A9D13F", label: "40–50%" },
  { min: 0.3, cor: "#7FA82C", label: "30–40%" },
  { min: 0.2, cor: "#5C7F23", label: "20–30%" },
  { min: 0.1, cor: "#41591C", label: "10–20%" },
  { min: 0.02, cor: "#2A3A17", label: "2–10%" },
  { min: 0, cor: "#1A2012", label: "< 2%" },
] as const;

function corDoShare(share: number): string {
  for (const b of BUCKETS) if (share >= b.min) return b.cor;
  return BUCKETS[BUCKETS.length - 1]!.cor;
}

export default function MapaChoropleth({ pontos, nomes, candidatoNome, candidatoNr }: MapaChoroplethProps) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/geo/mg-municipios.geojson")
      .then((r) => r.json())
      .then((g) => { if (vivo) setGeo(g); })
      .catch(() => { /* silencioso: mostra só o fundo */ });
    return () => { vivo = false; };
  }, []);

  const porIbge = useMemo(() => {
    const m = new Map<string, ChoroplethPonto>();
    for (const p of pontos) m.set(p.ibge, p);
    return m;
  }, [pontos]);

  const estilo = useMemo(
    () => (feature?: Feature) => {
      const ibge = String((feature?.properties as { codarea?: string } | undefined)?.codarea ?? "");
      const p = porIbge.get(ibge);
      const share = p && p.total > 0 ? p.cand / p.total : 0;
      return {
        fillColor: corDoShare(share),
        fillOpacity: p && p.total > 0 ? 0.82 : 0.25,
        color: "rgba(255,255,255,0.14)",
        weight: 0.5,
      } as L.PathOptions;
    },
    [porIbge],
  );

  const onEach = useMemo(
    () => (feature: Feature, layer: L.Layer) => {
      const ibge = String((feature.properties as { codarea?: string } | undefined)?.codarea ?? "");
      const p = porIbge.get(ibge);
      const nome = nomes[ibge] ?? ibge;
      const share = p && p.total > 0 ? (p.cand / p.total) * 100 : 0;
      const votos = p?.cand ?? 0;
      layer.bindTooltip(
        `<strong>${nome}</strong><br/>${votos.toLocaleString("pt-BR")} votos · ${share.toFixed(1)}%`,
        { sticky: true, direction: "top", opacity: 1 },
      );
    },
    [porIbge, nomes],
  );

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <MapContainer
        center={[-18.9, -44.4]}
        zoom={6}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: "#0A0C10" }}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          opacity={0.5}
        />
        {geo && <GeoJSONLayer key={candidatoNr} data={geo} style={estilo} onEachFeature={onEach} />}
      </MapContainer>

      {/* Legenda */}
      <div
        className="absolute bottom-3 left-3 z-[1000] w-[190px] rounded-xl px-3 py-2.5 text-xs"
        style={{ background: "rgba(10,12,16,0.85)", border: "1px solid rgba(255,255,255,0.1)", color: "#E8E8E4", backdropFilter: "blur(6px)" }}
      >
        <span className="block font-semibold leading-tight">% de {candidatoNome.split(" ")[0] || "votos"}</span>
        <span className="mb-2 block text-[10px] opacity-70">nº {candidatoNr} · votos / válidos do cargo</span>
        <div className="flex flex-col gap-1">
          {BUCKETS.map((b) => (
            <span key={b.label} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.cor }} aria-hidden />
              {b.label}
            </span>
          ))}
        </div>
        <span className="mt-2 block pt-1 text-[10px] opacity-70" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          Mapa © Esri · malha IBGE
        </span>
      </div>
    </div>
  );
}

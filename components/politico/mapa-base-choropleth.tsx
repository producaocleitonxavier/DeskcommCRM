"use client";

/**
 * MAPA DE CALOR DA BASE (War Room 2.0 — cidades). Pinta os municípios de MG pela
 * QUANTIDADE de contatos do CRM que moram neles (densidade da base). Dado EXATO:
 * vem de pol_mapa_base_municipios (cidade do cadastro → IBGE via intel_municipios);
 * a malha é /geo/mg-municipios.geojson (feature.codarea = código IBGE). Sem ponto
 * inventado — município sem base fica apagado. Client-only (Leaflet usa window):
 * importar via next/dynamic ssr:false (ver mapa-base-hero.tsx).
 */

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";

export interface BasePonto {
  ibge: string;
  nome: string;
  total: number;
}

// Faixas de contatos por cidade → cor (rampa lime da marca). A base é muito
// concentrada (a capital tem milhares, o interior unidades), então as faixas são
// escalonadas para o mapa não virar "tudo apagado menos uma cidade".
const BUCKETS = [
  { min: 1000, cor: "#D7F36A", label: "1.000+" },
  { min: 300, cor: "#A9D13F", label: "300–999" },
  { min: 100, cor: "#7FA82C", label: "100–299" },
  { min: 50, cor: "#5C7F23", label: "50–99" },
  { min: 20, cor: "#41591C", label: "20–49" },
  { min: 5, cor: "#2A3A17", label: "5–19" },
  { min: 1, cor: "#223014", label: "1–4" },
] as const;

function corDoTotal(total: number): string {
  for (const b of BUCKETS) if (total >= b.min) return b.cor;
  return "transparent";
}

export default function MapaBaseChoropleth({ pontos }: { pontos: BasePonto[] }) {
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
    const m = new Map<string, BasePonto>();
    for (const p of pontos) m.set(p.ibge, p);
    return m;
  }, [pontos]);

  const estilo = useMemo(
    () => (feature?: Feature) => {
      const ibge = String((feature?.properties as { codarea?: string } | undefined)?.codarea ?? "");
      const p = porIbge.get(ibge);
      return {
        fillColor: p ? corDoTotal(p.total) : "#12160E",
        fillOpacity: p ? 0.85 : 0.18,
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
      if (!p) return;
      layer.bindTooltip(
        `<strong>${p.nome}</strong><br/>${p.total.toLocaleString("pt-BR")} contato${p.total === 1 ? "" : "s"}`,
        { sticky: true, direction: "top", opacity: 1 },
      );
    },
    [porIbge],
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
        {geo && <GeoJSONLayer data={geo} style={estilo} onEachFeature={onEach} />}
      </MapContainer>

      {/* Legenda */}
      <div
        className="absolute bottom-3 left-3 z-[1000] w-[170px] rounded-xl px-3 py-2.5 text-xs"
        style={{ background: "rgba(10,12,16,0.85)", border: "1px solid rgba(255,255,255,0.1)", color: "#E8E8E4", backdropFilter: "blur(6px)" }}
      >
        <span className="block font-semibold leading-tight">Contatos por cidade</span>
        <span className="mb-2 block text-[10px] opacity-70">densidade da sua base</span>
        <div className="flex flex-col gap-1">
          {BUCKETS.map((b) => (
            <span key={b.label} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.cor }} aria-hidden />
              {b.label}
            </span>
          ))}
        </div>
        <span className="mt-2 block pt-1 text-[10px] opacity-70" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          tiles © Esri · malha IBGE
        </span>
      </div>
    </div>
  );
}

"use client";

/**
 * Mapa do Território (War Room 2.0) com DOIS modos alternáveis:
 *  - "calor": mancha de densidade (leaflet.heat) ponderada por contatos;
 *  - "bolhas": um círculo por cidade (tamanho = contatos, cor = força).
 *
 * Fundo: tiles escuros Esri "World Dark Gray" (gratuitos, SEM API key e sem
 * watermark — não quebra self-host; Carto passou a exigir chave e Stadia exige
 * key fora de localhost). Abre já enquadrado no RMBH (onde está a maior parte
 * da base). Client-only (Leaflet depende de `window`): importar via next/dynamic
 * ssr:false (ver mapa-eleitoral-hero.tsx).
 */

import { useEffect, useState } from "react";
import L from "leaflet";
import "leaflet.heat";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface MapaPonto {
  id: string;
  name: string;
  lat: number;
  lng: number;
  total: number;
  forca: number;
  novos: number;
  apoiadores: number;
  uf: string | null;
}

export interface MapaLeafletProps {
  pontos: MapaPonto[];
}

type Modo = "calor" | "bolhas";

const GRADIENTE: Record<number, string> = {
  0.2: "#2563eb",
  0.4: "#06b6d4",
  0.6: "#84cc16",
  0.8: "#f59e0b",
  1.0: "#ef4444",
};

const FAIXAS = [
  { min: 0.8, cor: "#ef4444", label: "Muito forte" },
  { min: 0.6, cor: "#f59e0b", label: "Forte" },
  { min: 0.4, cor: "#84cc16", label: "Média" },
  { min: 0.2, cor: "#06b6d4", label: "Baixa" },
  { min: 0.0, cor: "#2563eb", label: "Incipiente" },
] as const;

function corForca(intensidade: number): string {
  return (FAIXAS.find((f) => intensidade >= f.min) ?? FAIXAS[FAIXAS.length - 1]!).cor;
}

function raio(total: number, max: number): number {
  return Math.max(5, Math.min(38, (Math.sqrt(total) / Math.sqrt(max)) * 38));
}

/** Camada de calor: intensidade = log(contatos) normalizado; pontos próximos somam. */
function CamadaCalor({ pontos }: { pontos: MapaPonto[] }) {
  const map = useMap();
  useEffect(() => {
    const maxT = Math.max(...pontos.map((p) => p.total), 1);
    const ln = Math.log(maxT + 1);
    const pts: L.HeatLatLngTuple[] = pontos.map((p) => [p.lat, p.lng, ln > 0 ? Math.log(p.total + 1) / ln : 0]);
    const layer = L.heatLayer(pts, { radius: 28, blur: 22, max: 1, minOpacity: 0.28, gradient: GRADIENTE });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, pontos]);
  return null;
}

export default function MapaLeaflet({ pontos }: MapaLeafletProps) {
  const [modo, setModo] = useState<Modo>("calor");

  const maxForca = Math.max(...pontos.map((p) => p.forca), 1);
  const lnMaxF = Math.log(maxForca + 1);
  const maxTotal = Math.max(...pontos.map((p) => p.total), 1);
  const bolhas = [...pontos].sort((a, b) => b.total - a.total);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <MapContainer
        center={[-19.85, -43.95]}
        zoom={8}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: "#0A0C10" }}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          opacity={0.6}
        />

        {modo === "calor" && <CamadaCalor pontos={pontos} />}

        {modo === "bolhas" &&
          bolhas.map((p) => {
            const intensidade = lnMaxF > 0 ? Math.log(p.forca + 1) / lnMaxF : 0;
            const c = corForca(intensidade);
            return (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={raio(p.total, maxTotal)}
                pathOptions={{ color: c, fillColor: c, fillOpacity: 0.55, weight: 1, opacity: 0.9 }}
              >
                <Tooltip direction="top" opacity={1}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>: {p.total.toLocaleString("pt-BR")}
                </Tooltip>
                <Popup>
                  <div style={{ minWidth: 160, lineHeight: 1.55 }}>
                    <strong>
                      {p.name}
                      {p.uf ? ` · ${p.uf}` : ""}
                    </strong>
                    <br />
                    {p.total.toLocaleString("pt-BR")} contatos
                    <br />
                    {p.novos.toLocaleString("pt-BR")} novos · {p.apoiadores.toLocaleString("pt-BR")} apoiadores
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
      </MapContainer>

      {/* Toggle de modo */}
      <div className="absolute right-3 top-3 z-[1000] flex overflow-hidden rounded-full" style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10,12,16,0.82)", backdropFilter: "blur(6px)" }}>
        {(["calor", "bolhas"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className="px-3 py-1.5 text-xs font-semibold transition-colors"
            style={modo === m ? { background: "#D7F36A", color: "#16181D" } : { background: "transparent", color: "#E8E8E4" }}
          >
            {m === "calor" ? "Calor" : "Bolhas"}
          </button>
        ))}
      </div>

      {/* Legenda */}
      <div
        className="absolute bottom-3 left-3 z-[1000] w-[180px] rounded-xl px-3 py-2.5 text-xs"
        style={{ background: "rgba(10,12,16,0.82)", border: "1px solid rgba(255,255,255,0.1)", color: "#E8E8E4", backdropFilter: "blur(6px)" }}
      >
        {modo === "calor" ? (
          <>
            <span className="font-semibold">Densidade de contatos</span>
            <div className="mt-2 h-2 w-full rounded-full" style={{ background: "linear-gradient(90deg,#2563eb,#06b6d4,#84cc16,#f59e0b,#ef4444)" }} />
            <div className="mt-1 flex justify-between opacity-80">
              <span>menos</span>
              <span>mais</span>
            </div>
          </>
        ) : (
          <>
            <span className="font-semibold">Força por cidade</span>
            <div className="mt-1 flex flex-col gap-1">
              {FAIXAS.map((f) => (
                <span key={f.label} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: f.cor }} aria-hidden />
                  {f.label}
                </span>
              ))}
            </div>
            <span className="mt-1 block text-[10px] opacity-70">tamanho = nº de contatos</span>
          </>
        )}
        <span className="mt-2 block pt-1 text-[10px] opacity-70" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          Mapa © Esri
        </span>
      </div>
    </div>
  );
}

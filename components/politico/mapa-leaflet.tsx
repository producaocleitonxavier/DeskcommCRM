"use client";

/**
 * Mapa de calor de contatos por cidade (War Room 2.0). Bubble map sobre Leaflet
 * com tiles escuros gratuitos (CartoDB dark — sem API key, não quebra self-host).
 * Raio da bolha ∝ nº de contatos; cor = faixa de intensidade (quente = forte).
 *
 * É client-only (Leaflet depende de `window`); deve ser importado via
 * next/dynamic com ssr:false (ver mapa-eleitoral-hero.tsx).
 */

import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface MapaPonto {
  id: string;
  name: string;
  lat: number;
  lng: number;
  total: number;
  novos: number;
  apoiadores: number;
  uf: string | null;
}

export interface MapaLeafletProps {
  pontos: MapaPonto[];
}

const FAIXAS = [
  { min: 1000, cor: "#ef4444", label: "1.000+" },
  { min: 300, cor: "#f97316", label: "300–999" },
  { min: 100, cor: "#f59e0b", label: "100–299" },
  { min: 30, cor: "#eab308", label: "30–99" },
  { min: 0, cor: "#84cc16", label: "< 30" },
] as const;

function cor(total: number): string {
  return (FAIXAS.find((f) => total >= f.min) ?? FAIXAS[FAIXAS.length - 1]!).cor;
}

function raio(total: number): number {
  return Math.max(5, Math.min(42, Math.sqrt(total) * 1.15));
}

export default function MapaLeaflet({ pontos }: MapaLeafletProps) {
  // Desenha os maiores por baixo para os menores não ficarem escondidos.
  const ordenados = [...pontos].sort((a, b) => b.total - a.total);

  return (
    <div
      className="relative h-[460px] w-full overflow-hidden rounded-xl"
      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <MapContainer
        center={[-18.9, -44.0]}
        zoom={6}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: "#0A0C10" }}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {ordenados.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={raio(p.total)}
            pathOptions={{
              color: cor(p.total),
              fillColor: cor(p.total),
              fillOpacity: 0.5,
              weight: 1,
              opacity: 0.85,
            }}
          >
            <Tooltip direction="top" opacity={1}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>: {p.total.toLocaleString("pt-BR")}
            </Tooltip>
            <Popup>
              <div style={{ minWidth: 150, lineHeight: 1.5 }}>
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
        ))}
      </MapContainer>

      {/* Legenda */}
      <div
        className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-1 rounded-lg px-3 py-2 text-xs"
        style={{
          background: "rgba(10,12,16,0.85)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#E8E8E4",
          backdropFilter: "blur(4px)",
        }}
      >
        <span className="mb-0.5 font-semibold">Contatos por cidade</span>
        {FAIXAS.map((f) => (
          <span key={f.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: f.cor }} aria-hidden />
            {f.label}
          </span>
        ))}
      </div>
    </div>
  );
}

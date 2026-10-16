"use client";

/**
 * Mapa de calor de contatos por cidade (War Room 2.0). Bubble map sobre Leaflet
 * com tiles escuros Esri "World Dark Gray" — gratuitos, SEM API key e sem
 * watermark (não quebra self-host). (A Carto passou a exigir chave e estampa
 * "API KEY REQUIRED"; a Stadia exige key fora de localhost — por isso Esri.)
 *
 * - TAMANHO da bolha ∝ alcance (nº de contatos na cidade).
 * - COR da bolha = força (engajamento ponderado por nível de apoio), em escala
 *   de calor log-normalizada (frio azul → quente vermelho).
 *
 * É client-only (Leaflet depende de `window`); importar via next/dynamic
 * ssr:false (ver mapa-eleitoral-hero.tsx).
 */

import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
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

const RAMPA = [
  { min: 0.8, cor: "#ef4444", label: "Muito forte" },
  { min: 0.6, cor: "#f59e0b", label: "Forte" },
  { min: 0.4, cor: "#84cc16", label: "Média" },
  { min: 0.2, cor: "#06b6d4", label: "Baixa" },
  { min: 0.0, cor: "#2563eb", label: "Incipiente" },
] as const;

function corForca(intensidade: number): string {
  return (RAMPA.find((f) => intensidade >= f.min) ?? RAMPA[RAMPA.length - 1]!).cor;
}

function raio(total: number): number {
  return Math.max(5, Math.min(40, Math.sqrt(total) * 1.15));
}

export default function MapaLeaflet({ pontos }: MapaLeafletProps) {
  const maxForca = Math.max(...pontos.map((p) => p.forca), 1);
  const lnMax = Math.log(maxForca + 1);
  // Desenha os maiores por baixo para os menores não ficarem escondidos.
  const ordenados = [...pontos].sort((a, b) => b.total - a.total);

  return (
    <div
      className="relative h-[520px] w-full overflow-hidden rounded-2xl"
      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <MapContainer
        center={[-18.9, -44.2]}
        zoom={6}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: "#0A0C10" }}
      >
        {/* Base escura Esri (sem chave) + camada de rótulos sutil por cima. */}
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          opacity={0.55}
        />
        {ordenados.map((p) => {
          const intensidade = lnMax > 0 ? Math.log(p.forca + 1) / lnMax : 0;
          const c = corForca(intensidade);
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={raio(p.total)}
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

      {/* Legenda */}
      <div
        className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-1 rounded-xl px-3 py-2.5 text-xs"
        style={{
          background: "rgba(10,12,16,0.82)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#E8E8E4",
          backdropFilter: "blur(6px)",
        }}
      >
        <span className="mb-0.5 font-semibold">Força por cidade</span>
        {RAMPA.map((f) => (
          <span key={f.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: f.cor }} aria-hidden />
            {f.label}
          </span>
        ))}
        <span className="mt-1 pt-1 text-[10px] opacity-70" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          tamanho = nº de contatos · tiles © Esri
        </span>
      </div>
    </div>
  );
}

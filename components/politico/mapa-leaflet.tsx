"use client";

/**
 * Mapa de DENSIDADE de contatos por cidade (War Room 2.0). Em vez de centenas
 * de bolhas sobrepostas, uma mancha de calor suave (leaflet.heat) ponderada
 * pelo volume de contatos, sobre tiles escuros Esri "World Dark Gray"
 * (gratuitos, SEM API key e sem watermark — não quebra self-host; a Carto
 * passou a exigir chave e a Stadia exige key fora de localhost).
 *
 * Os rótulos de cidades vêm da própria camada Esri Reference (orientação sem
 * poluir). Detalhe cidade-a-cidade fica no painel "Onde somos fortes" e na
 * tabela. Client-only (Leaflet depende de `window`): importar via next/dynamic
 * ssr:false (ver mapa-eleitoral-hero.tsx).
 */

import { useEffect } from "react";
import L from "leaflet";
import "leaflet.heat";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
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

const GRADIENTE: Record<number, string> = {
  0.2: "#2563eb",
  0.4: "#06b6d4",
  0.6: "#84cc16",
  0.8: "#f59e0b",
  1.0: "#ef4444",
};

/** Camada de calor: intensidade = log(contatos) normalizado; pontos próximos somam. */
function CamadaCalor({ pontos }: { pontos: MapaPonto[] }) {
  const map = useMap();
  useEffect(() => {
    const maxT = Math.max(...pontos.map((p) => p.total), 1);
    const ln = Math.log(maxT + 1);
    const pts: L.HeatLatLngTuple[] = pontos.map((p) => [
      p.lat,
      p.lng,
      ln > 0 ? Math.log(p.total + 1) / ln : 0,
    ]);
    const layer = L.heatLayer(pts, {
      radius: 28,
      blur: 22,
      max: 1,
      minOpacity: 0.28,
      gradient: GRADIENTE,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, pontos]);
  return null;
}

export default function MapaLeaflet({ pontos }: MapaLeafletProps) {
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
        {/* Base escura Esri (sem chave) + rótulos sutis por cima. */}
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          opacity={0.6}
        />
        <CamadaCalor pontos={pontos} />
      </MapContainer>

      {/* Legenda */}
      <div
        className="absolute bottom-3 left-3 z-[1000] w-[180px] rounded-xl px-3 py-2.5 text-xs"
        style={{
          background: "rgba(10,12,16,0.82)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#E8E8E4",
          backdropFilter: "blur(6px)",
        }}
      >
        <span className="font-semibold">Densidade de contatos</span>
        <div
          className="mt-2 h-2 w-full rounded-full"
          style={{ background: "linear-gradient(90deg,#2563eb,#06b6d4,#84cc16,#f59e0b,#ef4444)" }}
        />
        <div className="mt-1 flex justify-between opacity-80">
          <span>menos</span>
          <span>mais</span>
        </div>
        <span
          className="mt-2 block pt-1 text-[10px] opacity-70"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          tiles © Esri
        </span>
      </div>
    </div>
  );
}

"use client";

/**
 * Mapa de entregas do Portal da Transparência: um marcador por obra pública que
 * tem coordenada. Cor = status. Fundo escuro Esri (sem API key, não quebra o
 * self-host — mesma escolha do mapa do Território). Client-only (Leaflet depende
 * de `window`): importar via next/dynamic ssr:false.
 */

import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface ObraPonto {
  id: string;
  titulo: string;
  status: string;
  percentual: number | null;
  lat: number;
  lng: number;
  bairro: string | null;
  municipio: string | null;
}

export interface MapaObrasPublicoProps {
  obras: ObraPonto[];
}

const STATUS_COR: Record<string, string> = {
  planejada: "#60A5FA",
  em_andamento: "#D7F36A",
  paralisada: "#ef4444",
  concluida: "#22C55E",
  cancelada: "#9CA3AF",
};
const STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  paralisada: "Paralisada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

function centro(obras: ObraPonto[]): [number, number] {
  if (obras.length === 0) return [-19.92, -43.94]; // BH como fallback
  const lat = obras.reduce((s, o) => s + o.lat, 0) / obras.length;
  const lng = obras.reduce((s, o) => s + o.lng, 0) / obras.length;
  return [lat, lng];
}

export default function MapaObrasPublico({ obras }: MapaObrasPublicoProps) {
  const statusPresentes = [...new Set(obras.map((o) => o.status))];
  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
      <MapContainer
        center={centro(obras)}
        zoom={11}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: "#0A0C10" }}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" opacity={0.6} />
        {obras.map((o) => {
          const cor = STATUS_COR[o.status] ?? "#D7F36A";
          return (
            <CircleMarker
              key={o.id}
              center={[o.lat, o.lng]}
              radius={10}
              pathOptions={{ color: cor, fillColor: cor, fillOpacity: 0.7, weight: 2, opacity: 1 }}
            >
              <Tooltip direction="top" opacity={1}>
                <span style={{ fontWeight: 600 }}>{o.titulo}</span>
              </Tooltip>
              <Popup>
                <div style={{ minWidth: 170, lineHeight: 1.5 }}>
                  <strong>{o.titulo}</strong>
                  <br />
                  {STATUS_LABEL[o.status] ?? o.status}
                  {typeof o.percentual === "number" ? ` · ${o.percentual}%` : ""}
                  {o.bairro || o.municipio ? (
                    <>
                      <br />
                      <span style={{ opacity: 0.8 }}>{[o.bairro, o.municipio].filter(Boolean).join(" · ")}</span>
                    </>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Legenda de status */}
      <div
        className="absolute bottom-3 left-3 z-[1000] rounded-xl px-3 py-2.5 text-xs"
        style={{ background: "rgba(10,12,16,0.82)", border: "1px solid rgba(255,255,255,0.1)", color: "#E8E8E4", backdropFilter: "blur(6px)" }}
      >
        <span className="font-semibold">Entregas no território</span>
        <div className="mt-1.5 flex flex-col gap-1">
          {statusPresentes.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COR[s] ?? "#D7F36A" }} aria-hidden />
              {STATUS_LABEL[s] ?? s}
            </span>
          ))}
        </div>
        <span className="mt-2 block pt-1 text-[10px] opacity-70" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>tiles © Esri</span>
      </div>
    </div>
  );
}

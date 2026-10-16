"use client";

/**
 * Funil "hero" — trapézio invertido: barras horizontais centradas que diminuem
 * de largura conforme a contagem. Cores em gradiente azul (topo claro → base
 * escura). Entrada animada (slide da esquerda, escalonado).
 */

import { useEffect, useState } from "react";

export interface FunnelHeroStage {
  label: string;
  value: number;
  color: string;
}

export interface FunnelHeroProps {
  data: FunnelHeroStage[];
  className?: string;
}

/** Luminância relativa simples para escolher texto claro/escuro sobre a cor. */
function textoSobre(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#16181D" : "#FFFFFF";
}

export function FunnelHero({ data, className }: FunnelHeroProps) {
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMontado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = data.reduce((s, d) => s + d.value, 0);
  const maior = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-2.5">
        {data.map((d, i) => {
          const largura = Math.max((d.value / maior) * 100, d.value > 0 ? 26 : 16);
          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0";
          const fg = textoSobre(d.color);
          return (
            <div
              key={d.label}
              className="flex items-center justify-between gap-3 rounded-2xl px-5 py-4"
              style={{
                width: `${largura}%`,
                minWidth: 200,
                background: d.color,
                color: fg,
                opacity: montado ? 1 : 0,
                transform: montado ? "translateX(0)" : "translateX(-24px)",
                transition: "opacity .5s ease, transform .5s ease",
                transitionDelay: `${i * 90}ms`,
              }}
            >
              <span className="truncate text-sm font-semibold">{d.label}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums" style={{ opacity: 0.95 }}>
                {d.value.toLocaleString("pt-BR")}
                <span className="ml-1.5 font-medium" style={{ opacity: 0.8 }}>
                  {pct}%
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FunnelHero;

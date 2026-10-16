"use client";

/**
 * Funil horizontal (estilo relatório premium) — cada estágio é uma linha de
 * largura total com uma barra proporcional ao maior estágio: gradiente + brilho
 * sutil, cantos arredondados, valor dentro da barra quando cabe, e chip de
 * conversão vs. a etapa anterior. Estágios com 0 mostram só o trilho (sem nub).
 *
 * Projetado para continuar legível mesmo quando um único estágio concentra
 * quase toda a base (caso em que o FunnelChart geométrico do Recharts degenera).
 * Entrada animada (largura cresce da esquerda, escalonada). Tema "Sala de Guerra".
 */

import { useEffect, useState } from "react";

export interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

export interface FunnelBoardProps {
  data: FunnelStage[];
  className?: string;
  /** Mostra o chip "↓ X% conversão" entre as etapas (default true). */
  showConversion?: boolean;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** 1 casa decimal só quando pequeno; evita "0.0%" poluindo números cheios. */
function fmtPct(p: number): string {
  return `${p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** Clareia um hex misturando com branco (amt 0..1) — para o gradiente da barra. */
function lighten(hex: string, amt: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Texto claro/escuro conforme a luminância da cor (para o valor dentro da barra). */
function textoSobre(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#16181D" : "#FFFFFF";
}

export function FunnelBoard({ data, className, showConversion = true }: FunnelBoardProps) {
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMontado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = data.reduce((s, d) => s + d.value, 0);
  const maior = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className={className ? `flex flex-col ${className}` : "flex flex-col"}>
      {data.map((d, i) => {
        const anterior = i > 0 ? data[i - 1]!.value : null;
        const conv = anterior !== null && anterior > 0 ? pct(d.value, anterior) : null;
        const share = pct(d.value, total);
        const largura = d.value > 0 ? Math.max((d.value / maior) * 100, 4) : 0;
        const vazio = d.value === 0;
        const valorDentro = largura >= 24;
        const fgDentro = textoSobre(d.color);

        return (
          <li key={d.label}>
            {/* Chip de conversão entre o estágio anterior e este */}
            {showConversion && conv !== null && (
              <div className="flex py-1.5 sm:pl-[136px]">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "var(--color-text-muted, rgba(255,255,255,0.6))",
                  }}
                >
                  <span className="leading-none opacity-70" aria-hidden>↓</span>
                  <span className="tabular-nums">{fmtPct(conv)}</span>
                  <span className="font-medium opacity-70">conversão</span>
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 py-1 sm:gap-4">
              {/* Rótulo do estágio */}
              <div className="flex w-24 shrink-0 items-center gap-2 sm:w-32">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: d.color,
                    boxShadow: vazio ? "none" : `0 0 0 3px ${d.color}22`,
                    opacity: vazio ? 0.4 : 1,
                  }}
                  aria-hidden
                />
                <span
                  className="truncate text-sm font-semibold"
                  style={{ color: vazio ? "var(--color-text-subtle, rgba(255,255,255,0.45))" : "var(--color-text, #E8E8E4)" }}
                >
                  {d.label}
                </span>
              </div>

              {/* Trilho + preenchimento proporcional */}
              <div
                className="relative h-12 flex-1 overflow-hidden rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.045)",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 flex items-center justify-end rounded-xl pr-3"
                  style={{
                    width: montado ? `${largura}%` : "0%",
                    background: vazio
                      ? "transparent"
                      : `linear-gradient(90deg, ${d.color} 0%, ${lighten(d.color, 0.16)} 100%)`,
                    boxShadow: vazio ? "none" : `0 4px 16px -4px ${d.color}80, inset 0 1px 0 rgba(255,255,255,0.22)`,
                    transition: "width .7s cubic-bezier(.22,1,.36,1)",
                    transitionDelay: `${i * 85}ms`,
                  }}
                >
                  {valorDentro && (
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: fgDentro, textShadow: fgDentro === "#FFFFFF" ? "0 1px 2px rgba(0,0,0,0.25)" : "none" }}
                    >
                      {d.value.toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>

              {/* Métricas à direita */}
              <div className="w-16 shrink-0 text-right sm:w-20">
                {!valorDentro && (
                  <div
                    className="text-base font-bold leading-none tabular-nums"
                    style={{ color: vazio ? "var(--color-text-subtle, rgba(255,255,255,0.45))" : "var(--color-text, #E8E8E4)" }}
                  >
                    {d.value.toLocaleString("pt-BR")}
                  </div>
                )}
                <div
                  className={`${valorDentro ? "" : "mt-1"} text-xs tabular-nums`}
                  style={{ color: "var(--color-text-muted, rgba(255,255,255,0.55))" }}
                >
                  {fmtPct(share)}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default FunnelBoard;

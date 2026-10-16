"use client";

/**
 * Funil horizontal (estilo relatório) — cada estágio é uma linha de largura
 * total com uma barra proporcional ao maior estágio, rótulo, contagem, % da
 * base e taxa de conversão vs. o estágio anterior.
 *
 * Projetado para continuar legível mesmo quando um único estágio concentra
 * quase toda a base (caso em que o FunnelChart geométrico do Recharts degenera
 * num triângulo fino com rótulos sobrepostos). Entrada animada (largura cresce
 * da esquerda, escalonada). Pensado para o tema "Sala de Guerra" (dark).
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
}

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** 1 casa decimal só quando o valor é pequeno; evita "0.0%" poluindo números cheios. */
function fmtPct(p: number): string {
  return `${p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

export function FunnelBoard({ data, className }: FunnelBoardProps) {
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMontado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = data.reduce((s, d) => s + d.value, 0);
  const maior = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className={className ? `flex flex-col gap-1 ${className}` : "flex flex-col gap-1"}>
      {data.map((d, i) => {
        const anterior = i > 0 ? data[i - 1]!.value : null;
        const conv = anterior !== null && anterior > 0 ? pct(d.value, anterior) : null;
        const share = pct(d.value, total);
        const largura = Math.max((d.value / maior) * 100, 1.5);

        return (
          <li key={d.label}>
            {/* Conector de conversão entre o estágio anterior e este */}
            {conv !== null && (
              <div
                className="flex items-center gap-1.5 py-1 pl-[9px] text-xs"
                style={{ color: "var(--color-text-subtle, rgba(255,255,255,0.45))" }}
              >
                <span className="leading-none" aria-hidden>
                  ↓
                </span>
                <span className="tabular-nums font-semibold">{fmtPct(conv)}</span>
                <span>conversão da etapa anterior</span>
              </div>
            )}

            <div className="flex items-center gap-3 sm:gap-4">
              {/* Rótulo do estágio */}
              <div className="flex w-24 shrink-0 items-center gap-2 sm:w-36">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: d.color }}
                  aria-hidden
                />
                <span
                  className="truncate text-sm font-semibold"
                  style={{ color: "var(--color-text, #E8E8E4)" }}
                >
                  {d.label}
                </span>
              </div>

              {/* Trilho + preenchimento proporcional */}
              <div
                className="relative h-10 flex-1 overflow-hidden rounded-lg"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-lg"
                  style={{
                    width: montado ? `${largura}%` : "0%",
                    minWidth: d.value > 0 ? 6 : 0,
                    background: d.color,
                    transition: "width .65s cubic-bezier(.22,1,.36,1)",
                    transitionDelay: `${i * 80}ms`,
                  }}
                />
              </div>

              {/* Métricas: contagem absoluta + % da base */}
              <div className="w-20 shrink-0 text-right sm:w-24">
                <div
                  className="text-base font-bold leading-none tabular-nums"
                  style={{ color: "var(--color-text, #E8E8E4)" }}
                >
                  {d.value.toLocaleString("pt-BR")}
                </div>
                <div
                  className="mt-1 text-xs tabular-nums"
                  style={{ color: "var(--color-text-muted, rgba(255,255,255,0.6))" }}
                >
                  {fmtPct(share)} da base
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

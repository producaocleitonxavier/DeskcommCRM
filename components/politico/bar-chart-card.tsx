"use client";

/**
 * Card com BarChart do Recharts. Barras com cantos arredondados (radius 8).
 * Aceita cor por barra via `fill` (ex.: temperatura — vermelho/amarelo/azul).
 */

import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

export interface BarChartDatum {
  name: string;
  value: number;
  /** Cor opcional da barra (default accent-400). */
  fill?: string;
}

export interface BarChartCardProps {
  title: string;
  data: BarChartDatum[];
  height?: number;
  /** Barras horizontais (categoria no eixo Y) — bom para rankings/funis. */
  horizontal?: boolean;
  className?: string;
}

const COR_PADRAO = "#C4E64A"; // espelha var(--color-accent-400)

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number }>;
}

function ChartTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-sm shadow-md"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="font-semibold" style={{ color: "var(--color-text)" }}>
        {label}
      </div>
      <div className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {(payload[0]?.value ?? 0).toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

export function BarChartCard({ title, data, height = 280, horizontal = false, className }: BarChartCardProps) {
  const eixoTick = { fontSize: 12, fill: "var(--color-text-subtle)" };
  const gid = `bar-grad-${useId().replace(/[:]/g, "")}`;
  // Folga no topo do eixo (12%) pra a barra mais longa NUNCA encostar na borda —
  // senão o rótulo de valor (que fica no fim da barra) corta. Régua: bater o
  // olho e ver o número inteiro.
  const vmax = data.reduce((m, d) => Math.max(m, Number(d.value) || 0), 0);
  const topo = vmax > 0 ? Math.ceil(vmax * 1.12) : 1;

  return (
    <div className={cn("gip-glass p-6", className)}>
      <h3 className="mb-4 font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: horizontal ? 4 : 16, right: horizontal ? 56 : 12, left: horizontal ? 8 : -8, bottom: 0 }}
        >
          <defs>
            {data.map((d, i) => {
              const c = d.fill ?? COR_PADRAO;
              return (
                <linearGradient key={i} id={`${gid}-${i}`} x1="0" y1="0" x2={horizontal ? "1" : "0"} y2={horizontal ? "0" : "1"}>
                  <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.4} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid
            strokeDasharray="4 4"
            stroke="rgba(255,255,255,0.05)"
            horizontal={!horizontal}
            vertical={horizontal}
          />
          {horizontal ? (
            <>
              <XAxis type="number" domain={[0, topo]} tick={eixoTick} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={eixoTick}
                tickLine={false}
                axisLine={false}
                width={110}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                tick={eixoTick}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              />
              <YAxis domain={[0, topo]} tick={eixoTick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            </>
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
          <Bar dataKey="value" radius={horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]} maxBarSize={64}>
            {data.map((d, i) => (
              <Cell key={`cell-${i}`} fill={`url(#${gid}-${i})`} stroke={d.fill ?? COR_PADRAO} strokeOpacity={0.35} strokeWidth={1} />
            ))}
            <LabelList
              dataKey="value"
              position={horizontal ? "right" : "top"}
              offset={8}
              style={{ fill: "var(--color-text)", fontSize: 12, fontWeight: 700 }}
              formatter={(v: number) => (v > 0 ? v.toLocaleString("pt-BR") : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BarChartCard;

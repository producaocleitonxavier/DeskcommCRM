"use client";

/**
 * Card com BarChart do Recharts. Barras com cantos arredondados (radius 8).
 * Aceita cor por barra via `fill` (ex.: temperatura — vermelho/amarelo/azul).
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

  return (
    <div className={cn("wr-card p-6", className)}>
      <h3 className="mb-4 font-heading text-base font-bold">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 4, right: 12, left: horizontal ? 8 : -8, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            horizontal={!horizontal}
            vertical={horizontal}
          />
          {horizontal ? (
            <>
              <XAxis type="number" tick={eixoTick} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
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
                axisLine={{ stroke: "var(--color-border)" }}
              />
              <YAxis tick={eixoTick} tickLine={false} axisLine={false} width={40} />
            </>
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-accent-50)" }} />
          <Bar dataKey="value" radius={horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={`cell-${i}`} fill={d.fill ?? COR_PADRAO} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BarChartCard;

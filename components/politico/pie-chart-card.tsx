"use client";

/**
 * Card com PieChart em donut (innerRadius 60). Total no centro, legenda embaixo.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";

export interface PieChartDatum {
  name: string;
  value: number;
  fill: string;
}

export interface PieChartCardProps {
  title: string;
  data: PieChartDatum[];
  height?: number;
  className?: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: PieChartDatum }>;
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const ponto = payload[0];
  return (
    <div
      className="rounded-xl px-3 py-2 text-sm shadow-md"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="font-semibold" style={{ color: "var(--color-text)" }}>
        {ponto?.name}
      </div>
      <div className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {(ponto?.value ?? 0).toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

export function PieChartCard({ title, data, height = 280, className }: PieChartCardProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className={cn("wr-card p-6", className)}>
      <h3 className="mb-4 font-heading text-base font-bold">{title}</h3>

      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={2}
              stroke="var(--color-surface)"
              strokeWidth={2}
              isAnimationActive
            >
              {data.map((d, i) => (
                <Cell key={`cell-${i}`} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Total no centro do donut */}
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center justify-center"
          style={{ top: 0, height }}
        >
          <span className="font-heading text-2xl font-bold tabular-nums leading-none">
            {total.toLocaleString("pt-BR")}
          </span>
          <span className="mt-0.5 text-xs text-muted-foreground">total</span>
        </div>
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
        {data.map((d, i) => (
          <div key={`leg-${i}`} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} aria-hidden />
            <span style={{ color: "var(--color-text-muted)" }}>{d.name}</span>
            <span className="tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>
              {d.value.toLocaleString("pt-BR")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PieChartCard;

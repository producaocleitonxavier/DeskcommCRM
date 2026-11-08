"use client";

/**
 * Card com PieChart em donut (innerRadius 60). Total no centro, legenda embaixo.
 *
 * O balão de hover NÃO é o tooltip flutuante do Recharts (ele seguia o cursor e
 * ora colava no número do centro — "6" ao lado de "8" virava "68" — ora sumia
 * atrás dele). Em vez disso, ao passar o mouse numa fatia, mostramos a fatia num
 * box FIXO logo abaixo do "total", sempre no mesmo lugar e sempre separado.
 */

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

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

export function PieChartCard({ title, data, height = 280, className }: PieChartCardProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const [ativo, setAtivo] = useState<number | null>(null);
  const fatia = ativo != null ? data[ativo] : null;

  return (
    <div className={cn("wr-card-dark p-6", className)}>
      <h3 className="mb-4 font-heading text-base font-bold">{title}</h3>

      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
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
              onMouseEnter={(_, i) => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
            >
              {data.map((d, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={d.fill}
                  opacity={ativo == null || ativo === i ? 1 : 0.45}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Centro: o total e, ao passar o mouse, a fatia num box fixo ABAIXO do
            total — nunca colado, sempre no mesmo lugar. */}
        <div
          className="pointer-events-none absolute inset-x-0 flex flex-col items-center justify-center px-2"
          style={{ top: 0, height }}
        >
          <span className="font-heading text-2xl font-bold tabular-nums leading-none">
            {total.toLocaleString("pt-BR")}
          </span>
          <span className="mt-0.5 text-xs text-muted-foreground">total</span>
          {fatia && (
            <div
              className="mt-2.5 flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs shadow-sm"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: fatia.fill }} aria-hidden />
              <span className="truncate font-semibold" style={{ color: "var(--color-text)" }}>
                {fatia.name}
              </span>
              <span className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                {fatia.value.toLocaleString("pt-BR")}
              </span>
            </div>
          )}
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

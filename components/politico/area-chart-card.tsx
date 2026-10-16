"use client";

/**
 * Card com AreaChart (gradient fill) do Recharts.
 * Cor default: accent-400 (#C4E64A — espelha var(--color-accent-400)).
 */

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

export interface AreaChartDatum {
  name: string;
  value: number;
}

export interface AreaChartCardProps {
  title: string;
  data: AreaChartDatum[];
  /** Cor da linha/gradient (default accent-400). */
  color?: string;
  height?: number;
  className?: string;
}

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

export function AreaChartCard({
  title,
  data,
  color = "#C4E64A",
  height = 280,
  className,
}: AreaChartCardProps) {
  const gradId = `area-grad-${useId().replace(/[:]/g, "")}`;

  return (
    <div className={cn("wr-card-dark p-6", className)}>
      <h3 className="mb-4 font-heading text-base font-bold">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "var(--color-text-subtle)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--color-text-subtle)" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--color-border)" }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AreaChartCard;

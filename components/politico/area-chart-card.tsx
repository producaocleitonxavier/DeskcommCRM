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
  const uid = useId().replace(/[:]/g, "");
  const gradId = `area-grad-${uid}`;
  const glowId = `area-glow-${uid}`;

  return (
    <div className={cn("gip-glass p-6", className)}>
      <h3 className="mb-4 font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="55%" stopColor={color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <filter id={glowId} x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation="3.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "var(--color-text-subtle)" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--color-text-subtle)" }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: color, strokeOpacity: 0.35, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            filter={`url(#${glowId})`}
            dot={false}
            activeDot={{ r: 4.5, fill: color, stroke: "#0A0C10", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AreaChartCard;

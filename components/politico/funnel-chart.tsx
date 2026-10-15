"use client";

/**
 * Funil político — FunnelChart do Recharts com as cores do funil (wr-funnel-*).
 * Labels da etapa no centro da barra, valor à direita, tooltip no design system.
 */

import {
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface FunnelDatum {
  label: string;
  value: number;
  color: string;
}

export interface FunnelChartCardProps {
  data: FunnelDatum[];
  height?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name?: string; value?: number } }>;
}

function FunnelTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const ponto = payload[0]?.payload;
  if (!ponto) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-sm shadow-md"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="font-semibold" style={{ color: "var(--color-text)" }}>
        {ponto.name}
      </div>
      <div className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>
        {(ponto.value ?? 0).toLocaleString("pt-BR")} pessoas
      </div>
    </div>
  );
}

export function FunnelChartCard({ data, height = 350 }: FunnelChartCardProps) {
  const chartData = data.map((d) => ({ name: d.label, value: d.value, fill: d.color }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <FunnelChart>
        <Tooltip content={<FunnelTooltip />} />
        <Funnel dataKey="value" data={chartData} isAnimationActive lastShapeType="rectangle">
          <LabelList
            position="center"
            dataKey="name"
            fill="#FFFFFF"
            stroke="none"
            fontSize={13}
            fontWeight={600}
          />
          <LabelList
            position="right"
            dataKey="value"
            fill="var(--color-text-muted)"
            stroke="none"
            fontSize={13}
            fontWeight={700}
            formatter={(v) => Number(v ?? 0).toLocaleString("pt-BR")}
          />
          {chartData.map((d, i) => (
            <Cell key={`cell-${i}`} fill={d.fill} />
          ))}
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

export default FunnelChartCard;

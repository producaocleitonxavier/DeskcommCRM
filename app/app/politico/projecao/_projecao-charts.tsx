"use client";

/**
 * Gráficos da Projeção Eleitoral (War Room 2.0): KPIs + projeção otimista
 * (AreaChart) e base segura (BarChart) por território. A view é por território
 * (não temporal), então os gráficos comparam cenários entre territórios.
 */

import { ShieldCheck, Target, TrendingUp } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { AreaChartCard } from "@/components/politico/area-chart-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";

export interface ProjecaoChartsProps {
  serieProjecao: { name: string; value: number }[];
  serieBase: { name: string; value: number }[];
  kpis: { projetados: number; base: number; margem: number };
}

export default function ProjecaoCharts({ serieProjecao, serieBase, kpis }: ProjecaoChartsProps) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Votos projetados (otimista)" valor={kpis.projetados} icone={TrendingUp} />
        <KpiCard label="Base segura" valor={kpis.base} icone={ShieldCheck} />
        <KpiCard label="Margem de segurança" valor={kpis.margem} sufixo="%" icone={Target} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AreaChartCard title="Projeção otimista por território" data={serieProjecao} color="#4352C4" />
        <BarChartCard title="Base segura por território" data={serieBase} horizontal height={300} />
      </section>
    </div>
  );
}

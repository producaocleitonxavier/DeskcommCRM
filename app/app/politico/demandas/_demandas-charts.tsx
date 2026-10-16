"use client";

/**
 * KPIs + distribuição por status das demandas (War Room 2.0).
 */

import { CheckCircle2, Clock, FolderOpen, Inbox } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { PieChartCard } from "@/components/politico/pie-chart-card";

export interface DemandasChartsProps {
  kpis: { total: number; abertas: number; resolvidasMes: number; tempoMedioDias: number | null };
  statusPie: { name: string; value: number; fill: string }[];
}

export default function DemandasCharts({ kpis, statusPie }: DemandasChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
      <section className="grid grid-cols-2 gap-4">
        <KpiCard label="Total de demandas" valor={kpis.total} icone={Inbox} />
        <KpiCard label="Abertas" valor={kpis.abertas} icone={FolderOpen} />
        <KpiCard label="Resolvidas este mês" valor={kpis.resolvidasMes} icone={CheckCircle2} />
        <KpiCard
          label="Tempo médio de resolução"
          valor={kpis.tempoMedioDias ?? "—"}
          sufixo={kpis.tempoMedioDias != null ? "dias" : undefined}
          icone={Clock}
        />
      </section>
      {statusPie.length > 0 && <PieChartCard title="Distribuição por status" data={statusPie} />}
    </div>
  );
}

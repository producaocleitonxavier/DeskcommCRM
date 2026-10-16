"use client";

/**
 * Seção de gráficos do Mapa Eleitoral (War Room 2.0): 4 KPIs + ranking de
 * cidades por contatos (BarChart) + distribuição por região/UF (PieChart).
 */

import { Globe, MapPin, Percent, Trophy } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { PieChartCard } from "@/components/politico/pie-chart-card";

export interface MapaChartsProps {
  ranking: { name: string; value: number }[];
  regioes: { name: string; value: number; fill: string }[];
  kpis: {
    cidadesCobertas: number;
    cidadeTop: string;
    regiaoTop: string;
    coberturaPct: number;
  };
}

export default function MapaCharts({ ranking, regioes, kpis }: MapaChartsProps) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Cidades cobertas" valor={kpis.cidadesCobertas} icone={MapPin} />
        <KpiCard label="Cidade com mais contatos" valor={kpis.cidadeTop} icone={Trophy} />
        <KpiCard label="Região mais forte" valor={kpis.regiaoTop} icone={Globe} />
        <KpiCard label="Cobertura territorial" valor={kpis.coberturaPct} sufixo="%" icone={Percent} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Ranking de cidades por contatos" data={ranking} horizontal height={320} />
        <PieChartCard title="Distribuição por região (UF)" data={regioes} />
      </section>
    </div>
  );
}

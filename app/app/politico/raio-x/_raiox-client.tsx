"use client";

/**
 * Visual do Raio-X de Votos (War Room 2.0): KPIs, comparativo de cidades por
 * votos (BarChart) e evolução por eleição. Dados de pol_tse_data.
 */

import { CalendarCheck, MapPin, Percent, Vote } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";

export interface RaioxClientProps {
  resumo: { totalSecoes: number; totalVotos: number; mediaComparecimento: number; cidadesCobertas: number };
  topCidades: { name: string; value: number }[];
  evolucao: { ano: number; votos: number; secoes: number; registros: number }[];
  temDados: boolean;
}

export default function RaioxClient({ resumo, topCidades, evolucao, temDados }: RaioxClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Território"
        titulo="Raio-X de Votos"
        subtitulo="Análise por seção eleitoral — dados do TSE, comparativo entre cidades e evolução."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Seções mapeadas" valor={resumo.totalSecoes} icone={MapPin} />
        <KpiCard label="Votos registrados" valor={resumo.totalVotos} icone={Vote} />
        <KpiCard label="Comparecimento médio" valor={resumo.mediaComparecimento} sufixo="%" icone={Percent} />
        <KpiCard label="Cidades" valor={resumo.cidadesCobertas} icone={CalendarCheck} />
      </section>

      {!temDados ? (
        <EmptyState
          icon={MapPin}
          title="Sem dados do TSE ainda"
          description="Importe resultados por seção eleitoral (TSE) para ver a análise territorial, o comparativo entre cidades e a evolução entre eleições."
        />
      ) : (
        <>
          <BarChartCard title="Comparativo de cidades por votos" data={topCidades} horizontal height={340} />

          <section className="wr-card p-6 sm:p-7">
            <h2 className="mb-4 font-heading text-base font-bold">Evolução por eleição</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {evolucao.map((e) => (
                <div key={e.ano} className="rounded-2xl p-4" style={{ background: "var(--color-surface-elevated)" }}>
                  <div className="font-heading text-2xl font-bold tabular-nums">{e.ano}</div>
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    <p>{e.votos.toLocaleString("pt-BR")} votos</p>
                    <p>{e.secoes.toLocaleString("pt-BR")} seções</p>
                    <p>{e.registros.toLocaleString("pt-BR")} registros</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

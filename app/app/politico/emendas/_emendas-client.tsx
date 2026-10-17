"use client";

/**
 * Visual das Emendas Parlamentares (War Room 2.0): KPIs financeiros,
 * valor indicado por área temática (BarChart) e cards por emenda.
 */

import Link from "next/link";
import { CheckCircle2, Clock, Wallet } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";
import { ExportCsv } from "@/components/politico/export-csv";

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  rascunho: { label: "Rascunho", bg: "#F0F0EB", fg: "#5B606B" },
  indicada: { label: "Indicada", bg: "#E4E7F8", fg: "#2F3DA8" },
  empenhada: { label: "Empenhada", bg: "#FCF1DC", fg: "#8A5A10" },
  liquidada: { label: "Liquidada", bg: "#FDE8D4", fg: "#9A4A10" },
  paga: { label: "Paga", bg: "#E2F5EC", fg: "#17784F" },
  devolvida: { label: "Devolvida", bg: "#FBE4E2", fg: "#A3302A" },
  cancelada: { label: "Cancelada", bg: "#F0F0EB", fg: "#9A9D8F" },
};

export interface EmendaItem {
  id: string;
  numero: string | null;
  ano: number;
  area: string;
  status: string;
  municipio: string | null;
  entidade: string | null;
  valorIndicado: string;
  valorPago: string;
}

export interface EmendasClientProps {
  kpis: { alocado: string; executado: string; pendente: string };
  valorPorArea: { name: string; value: number; fill: string }[];
  emendas: EmendaItem[];
}

export default function EmendasClient({ kpis, valorPorArea, emendas }: EmendasClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <SectionHeader
        title="Emendas Parlamentares"
        subtitle="Valores, destino e status de execução."
        action={{ label: "+ Nova emenda", href: "/app/politico/emendas/novo" }}
        actionTone="accent"
      />

      {emendas.length > 0 && (
        <div className="flex justify-end">
          <ExportCsv
            filename="emendas.csv"
            headers={["Número", "Ano", "Área", "Município", "Entidade", "Status", "Indicado", "Pago"]}
            rows={emendas.map((e) => [e.numero, e.ano, e.area, e.municipio, e.entidade, e.status, e.valorIndicado, e.valorPago])}
          />
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total alocado" valor={kpis.alocado} icone={Wallet} />
        <KpiCard label="Executado (pago)" valor={kpis.executado} icone={CheckCircle2} />
        <KpiCard label="Pendente" valor={kpis.pendente} icone={Clock} />
      </section>

      {emendas.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma emenda cadastrada"
          description="Cadastre a primeira emenda para acompanhar valores indicados, empenhados, pagos e o status de execução."
        />
      ) : (
        <>
          {valorPorArea.length > 0 && (
            <BarChartCard title="Valor indicado por área (R$)" data={valorPorArea} horizontal height={320} />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {emendas.map((e) => {
              const st = STATUS[e.status] ?? { label: e.status, bg: "#F0F0EB", fg: "#5B606B" };
              const destino = e.municipio || e.entidade || "—";
              return (
                <Link key={e.id} href={`/app/politico/emendas/${e.id}`} className="wr-card flex flex-col gap-2.5 p-5 transition-shadow duration-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                        {e.numero ?? "s/nº"} · {e.ano}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-medium">{destino}</div>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.fg }}>
                      {st.label}
                    </span>
                  </div>
                  <span className="w-fit rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>
                    {e.area}
                  </span>
                  <div className="mt-auto border-t pt-2.5 text-sm" style={{ borderColor: "var(--color-border)" }}>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Indicado</span>
                      <span className="font-semibold tabular-nums">{e.valorIndicado}</span>
                    </div>
                    <div className="mt-0.5 flex justify-between">
                      <span className="text-muted-foreground">Pago</span>
                      <span className="font-semibold tabular-nums" style={{ color: "#17784F" }}>{e.valorPago}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

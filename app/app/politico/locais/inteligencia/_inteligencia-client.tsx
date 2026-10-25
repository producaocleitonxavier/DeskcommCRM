"use client";

/**
 * Inteligência de Eventos (Fase 2D) — lê o funil de eventos como território.
 * KPIs + público quente por zona (barras) + cadência mensal + ranking de locais.
 * Design System: wr-card + tokens + componentes politico (KpiCard, BarChartCard).
 */

import Link from "next/link";
import { CalendarCheck, Users, MapPin, Building2, Flame } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";
import { BarChartCard } from "@/components/politico/bar-chart-card";

export interface ZonaRow {
  zona: string;
  pessoas: number;
  eventos: number;
  locais: number;
}
export interface LocalRow {
  id: string;
  nome: string;
  tipo: string;
  bairro: string | null;
  zona: string | null;
  pessoas: number;
}
export interface MesRow {
  mes: string;
  eventos: number;
}

export interface InteligenciaClientProps {
  kpis: { eventos: number; pessoas: number; zonas: number; locais: number };
  zonas: ZonaRow[];
  topLocais: LocalRow[];
  meses: MesRow[];
}

// Escala de calor pelo público da zona (quanto maior, mais quente).
function corCalor(valor: number, max: number): string {
  if (max <= 0) return "#64748B";
  const r = valor / max;
  if (r >= 0.66) return "#EF4444"; // quente
  if (r >= 0.33) return "#F59E0B"; // morno
  return "#60A5FA"; // frio
}

export default function InteligenciaClient({ kpis, zonas, topLocais, meses }: InteligenciaClientProps) {
  const temDados = kpis.pessoas > 0;
  const maxZona = Math.max(0, ...zonas.map((z) => z.pessoas));

  const dadosZona = zonas
    .filter((z) => z.pessoas > 0)
    .slice(0, 10)
    .map((z) => ({
      name: z.zona === "Sem zona" ? "Sem zona" : `Zona ${z.zona}`,
      value: z.pessoas,
      fill: corCalor(z.pessoas, maxZona),
    }));

  const dadosLocais = topLocais.slice(0, 8).map((l) => ({ name: l.nome, value: l.pessoas }));
  const dadosMeses = meses.map((m) => ({ name: m.mes, value: m.eventos }));

  return (
    <div className="mx-auto max-w-[1140px] space-y-6 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Gabinete · Eventos"
        titulo="Inteligência de Eventos"
        subtitulo="Cada cadastro feito num evento vira leitura de território: onde está o público quente, quais locais mais capturam e a sua cadência."
        acoes={[{ href: "/app/politico/locais", label: "← Locais & Eventos" }]}
      />

      {!temDados ? (
        <EmptyState
          icon={Flame}
          title="Ainda não há público captado em eventos"
          description="Assim que você registrar pessoas nos eventos (na ficha de cada local), este painel mostra onde está o público quente, por zona eleitoral, e quais locais mais convertem."
          action={{ label: "Ir para Locais & Eventos", href: "/app/politico/locais" }}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Eventos realizados" valor={kpis.eventos} icone={CalendarCheck} />
            <KpiCard label="Público captado" valor={kpis.pessoas} icone={Users} />
            <KpiCard label="Zonas alcançadas" valor={kpis.zonas} icone={MapPin} />
            <KpiCard label="Locais ativos" valor={kpis.locais} icone={Building2} />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {dadosZona.length > 0 && (
              <BarChartCard title="Público quente por zona eleitoral" data={dadosZona} horizontal height={Math.max(220, dadosZona.length * 34)} />
            )}
            {dadosLocais.length > 0 && (
              <BarChartCard title="Locais que mais capturam" data={dadosLocais} horizontal height={Math.max(220, dadosLocais.length * 34)} />
            )}
          </div>

          <BarChartCard title="Cadência de eventos (últimos 12 meses)" data={dadosMeses} height={240} />

          {/* Tabela detalhada por zona */}
          <div className="wr-card-dark p-6">
            <h3 className="mb-4 font-heading text-base font-bold">Território por zona</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: "var(--color-text-subtle)" }}>
                    <th className="pb-2 font-semibold">Zona</th>
                    <th className="pb-2 text-right font-semibold">Locais</th>
                    <th className="pb-2 text-right font-semibold">Eventos</th>
                    <th className="pb-2 text-right font-semibold">Público</th>
                  </tr>
                </thead>
                <tbody>
                  {zonas.map((z) => (
                    <tr key={z.zona} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: corCalor(z.pessoas, maxZona) }} aria-hidden />
                          {z.zona === "Sem zona" ? "Sem zona definida" : `Zona ${z.zona}`}
                        </span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>{z.locais}</td>
                      <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>{z.eventos}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{z.pessoas.toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--color-text-subtle)" }}>
              A zona vem do TSE pelo bairro do local. <span style={{ color: "#EF4444" }}>Vermelho</span> = público mais concentrado,{" "}
              <span style={{ color: "#F59E0B" }}>amarelo</span> = intermediário, <span style={{ color: "#60A5FA" }}>azul</span> = começando.
            </p>
          </div>

          {/* Ranking de locais (lista) */}
          <div className="wr-card-dark p-6">
            <h3 className="mb-4 font-heading text-base font-bold">Ranking de locais por público</h3>
            <ul className="space-y-2">
              {topLocais.map((l, i) => (
                <li key={l.id}>
                  <Link
                    href={`/app/politico/locais/${l.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "rgba(215,243,106,0.12)", color: "var(--color-accent)" }}>
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{l.nome}</span>
                        <span className="block truncate text-xs" style={{ color: "var(--color-text-subtle)" }}>
                          {[l.bairro, l.zona ? `Zona ${l.zona}` : null].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold tabular-nums">
                      <Users className="h-4 w-4" style={{ color: "var(--color-text-subtle)" }} aria-hidden /> {l.pessoas}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

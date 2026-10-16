"use client";

/**
 * Camada "Zonas" do Território (War Room 2.0), redesenhada: faixa de KPIs,
 * mapa de calor em destaque + painel "Onde somos fortes", e tabela enxuta de
 * todas as cidades. Recebe as cidades já geolocalizadas, com força calculada.
 */

import { Flame, MapPin, Trophy, Users } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import MapaEleitoralHero from "@/components/politico/mapa-eleitoral-hero";
import type { MapaPonto } from "@/components/politico/mapa-leaflet";

export interface CidadeRow extends MapaPonto {
  simpatizantes: number;
}

export interface TerritorioClientProps {
  cidades: CidadeRow[];
  totalContatos: number;
  cidadeTop: string;
  concentracaoTopPct: number;
}

// Rampa de calor (espelha a do mapa) para as barras de força.
function corForca(intensidade: number): string {
  if (intensidade >= 0.8) return "#ef4444";
  if (intensidade >= 0.6) return "#f59e0b";
  if (intensidade >= 0.4) return "#84cc16";
  if (intensidade >= 0.2) return "#06b6d4";
  return "#2563eb";
}

export default function TerritorioClient({
  cidades,
  totalContatos,
  cidadeTop,
  concentracaoTopPct,
}: TerritorioClientProps) {
  const maxForca = Math.max(...cidades.map((c) => c.forca), 1);
  const lnMax = Math.log(maxForca + 1);
  const maxTotal = Math.max(...cidades.map((c) => c.total), 1);
  const intensidade = (forca: number) => (lnMax > 0 ? Math.log(forca + 1) / lnMax : 0);
  const top = cidades.slice(0, 12);

  return (
    <div className="space-y-4">
      {/* ── KPIs ──────────────────────────────────────────────── */}
      <section aria-label="Resumo territorial" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Cidades mapeadas" valor={cidades.length} icone={MapPin} />
        <KpiCard label="Contatos localizados" valor={totalContatos} icone={Users} />
        <KpiCard label="Cidade líder" valor={cidadeTop} icone={Trophy} variant="dark" />
        <KpiCard label="Concentração na líder" valor={concentracaoTopPct} sufixo="%" icone={Flame} />
      </section>

      {/* ── Mapa + ranking ────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
        <MapaEleitoralHero pontos={cidades} />

        <div className="wr-card flex min-h-0 flex-col p-5">
          <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
            Onde somos fortes
          </h2>
          <p className="mb-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
            Top cidades por contatos
          </p>
          <ol className="flex flex-col gap-2.5 overflow-y-auto pr-1" style={{ maxHeight: 452 }}>
            {top.map((c, i) => {
              const larg = Math.max((c.total / maxTotal) * 100, 3);
              const cor = corForca(intensidade(c.forca));
              return (
                <li key={c.id} className="flex items-center gap-3">
                  <span
                    className="w-5 shrink-0 text-right text-xs font-bold tabular-nums"
                    style={{ color: i < 3 ? "#D7F36A" : "var(--color-text-subtle)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        {c.name}
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                        {c.total.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full" style={{ width: `${larg}%`, background: cor }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── Tabela: todas as cidades ──────────────────────────── */}
      <section aria-label="Todas as cidades" className="wr-card overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
            Todas as cidades
          </h2>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
            {cidades.length.toLocaleString("pt-BR")} cidades
          </span>
        </div>
        <div className="overflow-auto" style={{ maxHeight: 520 }}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10" style={{ background: "var(--color-surface)" }}>
              <tr>
                {["#", "Cidade", "UF", "Contatos", "Força", "% do total"].map((col, i) => (
                  <th
                    key={col}
                    className={`whitespace-nowrap px-4 py-2.5 text-[12px] font-medium ${i >= 3 ? "text-right" : "text-left"}`}
                    style={{ color: "var(--color-text-subtle)", borderBottom: "1px solid var(--color-border)" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cidades.map((c, i) => {
                const larg = Math.max((c.forca / maxForca) * 100, 2);
                const cor = corForca(intensidade(c.forca));
                const pct = totalContatos > 0 ? (c.total / totalContatos) * 100 : 0;
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-text)" }}>
                      {c.name}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--color-text-muted)" }}>
                      {c.uf ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                      {c.total.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${larg}%`, background: cor }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                      {pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

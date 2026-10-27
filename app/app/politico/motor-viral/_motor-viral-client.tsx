"use client";

/**
 * Visual do Motor Viral (War Room 2.0): KPIs de conteúdo gerado, evolução
 * semanal (AreaChart) e grid de cards de conteúdo. Fonte: pol_generated_content.
 */

import Link from "next/link";
import { Flame, Plus, Share2, Sparkles } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { AreaChartCard } from "@/components/politico/area-chart-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";

export interface ConteudoItem {
  id: string;
  title: string;
  topic: string;
  tipo: string;
  plataforma: string | null;
  viralScore: number | null;
  qualityScore: number | null;
  fonte: string;
  createdAt: string;
}

export interface MotorViralClientProps {
  kpis: { totalConteudos: number; geradosPorIA: number; scoreViralMedio: number };
  serieSemanal: { name: string; value: number }[];
  conteudos: ConteudoItem[];
  pagina: number;
  totalPaginas: number;
}

function scoreCor(score: number | null): string {
  if (score == null) return "var(--color-text-subtle)";
  if (score >= 7) return "#17784F";
  if (score >= 4) return "#8A5A10";
  return "#A3302A";
}

export default function MotorViralClient({ kpis, serieSemanal, conteudos, pagina, totalPaginas }: MotorViralClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Engajamento"
        titulo="Motor Viral"
        subtitulo="Conteúdo otimizado por IA para ampliar alcance e engajamento."
        acoes={[{ href: "/app/politico/motor-viral/novo", label: "+ Nova campanha", primary: true }]}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total de conteúdos" valor={kpis.totalConteudos} icone={Share2} />
        <KpiCard label="Gerados por IA" valor={kpis.geradosPorIA} icone={Sparkles} />
        <KpiCard label="Potencial de viralização médio" valor={kpis.scoreViralMedio} icone={Flame} />
      </section>

      {conteudos.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="Nenhum conteúdo ainda"
          description="Crie seu primeiro conteúdo com IA para impulsionar o alcance e o engajamento da campanha."
          action={{ label: "Nova campanha", href: "/app/politico/motor-viral/novo" }}
        />
      ) : (
        <>
          <AreaChartCard title="Conteúdos gerados por semana" data={serieSemanal} color="#C4E64A" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {conteudos.map((c) => (
              <div key={c.id} className="wr-card flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-md">
                <div>
                  <h3 className="font-semibold leading-snug">{c.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">{c.topic}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>
                    {c.tipo}
                  </span>
                  {c.plataforma && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#E4E7F8", color: "#2F3DA8" }}>
                      {c.plataforma}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-xs" style={{ borderColor: "var(--color-border)" }}>
                  <span style={{ color: "var(--color-text-subtle)" }}>
                    Viral{" "}
                    <strong className="tabular-nums" style={{ color: scoreCor(c.viralScore) }}>
                      {c.viralScore != null ? Number(c.viralScore).toFixed(1) : "—"}
                    </strong>
                  </span>
                  <time dateTime={c.createdAt} style={{ color: "var(--color-text-subtle)" }}>
                    {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                  </time>
                </div>
              </div>
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between text-sm" style={{ color: "var(--color-text-subtle)" }}>
              <span>Página {pagina} de {totalPaginas}</span>
              <div className="flex gap-2">
                {pagina > 1 && (
                  <Link href={`/app/politico/motor-viral?pagina=${pagina - 1}`} className="wr-btn text-sm">Anterior</Link>
                )}
                {pagina < totalPaginas && (
                  <Link href={`/app/politico/motor-viral?pagina=${pagina + 1}`} className="wr-btn text-sm">Próxima</Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

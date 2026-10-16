"use client";

/**
 * Visual dos Projetos de Lei (War Room 2.0): KPIs + cards por status com
 * timeline de tramitação (apresentação → última movimentação).
 */

import { CheckCircle2, FileText, Scale, Target } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  rascunho: { label: "Rascunho", bg: "#F0F0EB", fg: "#5B606B" },
  apresentado: { label: "Apresentado", bg: "#E4E7F8", fg: "#2F3DA8" },
  em_tramitacao: { label: "Em tramitação", bg: "#FCF1DC", fg: "#8A5A10" },
  em_comissao: { label: "Em comissão", bg: "#FDE8D4", fg: "#9A4A10" },
  aprovado_comissao: { label: "Aprovado comissão", bg: "#D7F0EA", fg: "#0F6E5A" },
  em_plenario: { label: "Em plenário", bg: "#EADDFB", fg: "#6D28D9" },
  aprovado: { label: "Aprovado", bg: "#E2F5EC", fg: "#17784F" },
  vetado: { label: "Vetado", bg: "#FBE4E2", fg: "#A3302A" },
  promulgado: { label: "Promulgado", bg: "#E2F5EC", fg: "#17784F" },
  arquivado: { label: "Arquivado", bg: "#F0F0EB", fg: "#5B606B" },
  retirado: { label: "Retirado", bg: "#F0F0EB", fg: "#5B606B" },
};

const ESFERA: Record<string, string> = { municipal: "Municipal", estadual: "Estadual", federal: "Federal" };

export interface ProjetoItem {
  id: string;
  numero: string;
  tipo: string;
  esfera: string;
  titulo: string;
  status: string;
  comissao: string | null;
  autorMandatario: boolean;
  alinhamento: boolean;
  dataApresentacao: string | null;
  dataUltimaMov: string | null;
}

export interface ProjetosClientProps {
  kpis: { emTramitacao: number; deAutoria: number; alinhados: number; aprovados: number };
  projetos: ProjetoItem[];
}

function data(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export default function ProjetosClient({ kpis, projetos }: ProjetosClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <SectionHeader title="Projetos de Lei" subtitle="Acompanhamento legislativo — projetos, indicações e requerimentos." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Em tramitação" valor={kpis.emTramitacao} icone={Scale} />
        <KpiCard label="De autoria" valor={kpis.deAutoria} icone={FileText} />
        <KpiCard label="Alinhados à campanha" valor={kpis.alinhados} icone={Target} />
        <KpiCard label="Aprovados" valor={kpis.aprovados} icone={CheckCircle2} />
      </section>

      {projetos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum projeto cadastrado"
          description="Cadastre o primeiro projeto de lei para acompanhar a tramitação, as comissões e o alinhamento com a campanha."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {projetos.map((p) => {
            const st = STATUS[p.status] ?? { label: p.status, bg: "#F0F0EB", fg: "#5B606B" };
            return (
              <div key={p.id} className="wr-card p-5 transition-shadow duration-200 hover:shadow-md" style={{ borderLeft: `4px solid ${st.fg}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                      {p.numero} · {ESFERA[p.esfera] ?? p.esfera}
                    </div>
                    <h3 className="mt-0.5 font-semibold leading-snug">{p.titulo}</h3>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.fg }}>
                    {st.label}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {p.autorMandatario && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#E4E7F8", color: "#2F3DA8" }}>De autoria</span>
                  )}
                  {p.alinhamento && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#E2F5EC", color: "#17784F" }}>Alinhado</span>
                  )}
                  {p.comissao && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#F0F0EB", color: "#5B606B" }}>{p.comissao}</span>
                  )}
                </div>

                {/* Timeline de tramitação */}
                <div className="mt-3 flex items-center gap-2 border-t pt-3 text-xs" style={{ borderColor: "var(--color-border)" }}>
                  <span style={{ color: "var(--color-text-subtle)" }}>Apresentado <strong style={{ color: "var(--color-text-muted)" }}>{data(p.dataApresentacao)}</strong></span>
                  <span style={{ color: "var(--color-text-subtle)" }}>→</span>
                  <span style={{ color: "var(--color-text-subtle)" }}>Últ. mov. <strong style={{ color: "var(--color-text-muted)" }}>{data(p.dataUltimaMov)}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

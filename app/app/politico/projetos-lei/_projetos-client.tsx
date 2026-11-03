"use client";

/**
 * Visual dos Projetos de Lei (War Room 2.0): painel de indicadores + filtros/busca
 * + cards por status com timeline de tramitação. Tema é classificado/colorido
 * sozinho; "Virou Lei" ganha troféu; autoria única vs coautoria em selo.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Landmark, Scale, Target, Trophy, UserCheck } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";
import { RelatorioGabineteButton } from "@/components/politico/relatorio-gabinete-button";
import { SincronizarProposicoesButton } from "@/components/politico/sincronizar-proposicoes-button";
import { classificarArea, rotuloArea } from "@/lib/politico/emenda-classificar";
import { corDoOrgao } from "@/lib/politico/demanda-cobranca";
import { grupoSituacao, GRUPOS_SITUACAO, type GrupoSituacao } from "@/lib/politico/projeto-lei";

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
const TODOS = "__todos__";

export interface ProjetoItem {
  id: string;
  numero: string;
  tipo: string;
  esfera: string;
  titulo: string;
  status: string;
  comissao: string | null;
  tema: string | null;
  autorMandatario: boolean;
  alinhamento: boolean;
  coletiva: boolean;
  dataApresentacao: string | null;
  dataUltimaMov: string | null;
}

export interface ProjetosClientProps {
  kpis: { total: number; virouLei: number; nasComissoes: number; emTramitacao: number; deAutoria: number; alinhados: number };
  projetos: ProjetoItem[];
  ehAdmin?: boolean;
}

function data(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

/** Tema que aparece na tela: o escrito; se vazio, a área adivinhada pelo título. */
function temaDoProjeto(p: ProjetoItem): string {
  return (p.tema ?? "").trim() || rotuloArea(classificarArea(p.titulo));
}

export default function ProjetosClient({ kpis, projetos, ehAdmin }: ProjetosClientProps) {
  const [busca, setBusca] = useState("");
  const [fSituacao, setFSituacao] = useState<GrupoSituacao | typeof TODOS>(TODOS);
  const [fAutoria, setFAutoria] = useState<"autoria" | "coautoria" | typeof TODOS>(TODOS);
  const [fTema, setFTema] = useState<string>(TODOS);

  const temas = useMemo(
    () => [...new Set(projetos.map(temaDoProjeto).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [projetos],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return projetos.filter((p) => {
      if (fSituacao !== TODOS && grupoSituacao(p.status) !== fSituacao) return false;
      if (fAutoria === "autoria" && !p.autorMandatario) return false;
      if (fAutoria === "coautoria" && !p.coletiva) return false;
      if (fTema !== TODOS && temaDoProjeto(p) !== fTema) return false;
      if (q) {
        const alvo = [p.numero, p.titulo, p.comissao, p.tema].filter(Boolean).join(" ").toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [projetos, busca, fSituacao, fAutoria, fTema]);

  const temFiltro = busca.trim() !== "" || fSituacao !== TODOS || fAutoria !== TODOS || fTema !== TODOS;
  const limpar = () => { setBusca(""); setFSituacao(TODOS); setFAutoria(TODOS); setFTema(TODOS); };

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] px-4 py-7 space-y-6">
      <CommandHero
        eyebrow="Gabinete · Projetos de Lei"
        titulo="Projetos de Lei"
        subtitulo="Acompanhamento legislativo — projetos, indicações e requerimentos."
        acoes={[{ href: "/app/politico/projetos-lei/novo", label: "+ Novo projeto", primary: true }]}
        extra={ehAdmin ? <SincronizarProposicoesButton /> : undefined}
      />

      {projetos.length > 0 && (
        <div className="flex justify-end">
          <RelatorioGabineteButton
            dados={{
              slug: "projetos",
              titulo: "Relatório de Projetos de Lei",
              resumo: `${filtrados.length} de ${projetos.length} projeto(s)`,
              kpis: [
                { num: String(kpis.total), label: "Total" },
                { num: String(kpis.virouLei), label: "Virou Lei" },
                { num: String(kpis.nasComissoes), label: "Nas comissões" },
                { num: String(kpis.deAutoria), label: "De autoria" },
              ],
              colunas: [
                { header: "Número", largura: "9%" },
                { header: "Esfera", largura: "7%" },
                { header: "Título", largura: "24%" },
                { header: "Área/Tema", largura: "12%" },
                { header: "Status", largura: "12%" },
                { header: "Comissão", largura: "12%" },
                { header: "Autoria", largura: "8%" },
                { header: "Apres.", largura: "7%" },
                { header: "Últ. mov.", largura: "7%" },
              ],
              linhas: filtrados.map((p) => [
                p.numero ?? "",
                ESFERA[p.esfera] ?? p.esfera,
                p.titulo ?? "",
                temaDoProjeto(p),
                STATUS[p.status]?.label ?? p.status,
                p.comissao ?? "",
                p.coletiva ? "Coautoria" : p.autorMandatario ? "De autoria" : "—",
                data(p.dataApresentacao),
                data(p.dataUltimaMov),
              ]),
            }}
          />
        </div>
      )}

      {/* Indicadores */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total" valor={kpis.total} icone={FileText} />
        <KpiCard label="Virou Lei" valor={kpis.virouLei} icone={Trophy} />
        <KpiCard label="Nas comissões" valor={kpis.nasComissoes} icone={Landmark} />
        <KpiCard label="Em tramitação" valor={kpis.emTramitacao} icone={Scale} />
        <KpiCard label="De autoria" valor={kpis.deAutoria} icone={UserCheck} />
        <KpiCard label="Alinhados" valor={kpis.alinhados} icone={Target} />
      </section>

      {projetos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum projeto cadastrado"
          description="Cadastre o primeiro projeto de lei para acompanhar a tramitação, as comissões e o alinhamento com a campanha."
        />
      ) : (
        <>
          {/* Filtros + busca */}
          <section className="gip-glass p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar número, título ou comissão"
                className="wr-input sm:col-span-2 lg:col-span-1"
              />
              <select value={fSituacao} onChange={(e) => setFSituacao(e.target.value as GrupoSituacao | typeof TODOS)} className="wr-input">
                <option value={TODOS}>Situação: todas</option>
                {GRUPOS_SITUACAO.map((g) => <option key={g.grupo} value={g.grupo}>{g.label}</option>)}
              </select>
              <select value={fAutoria} onChange={(e) => setFAutoria(e.target.value as "autoria" | "coautoria" | typeof TODOS)} className="wr-input">
                <option value={TODOS}>Autoria: todas</option>
                <option value="autoria">De autoria</option>
                <option value="coautoria">Com coautores</option>
              </select>
              <select value={fTema} onChange={(e) => setFTema(e.target.value)} className="wr-input">
                <option value={TODOS}>Área/Tema: todas</option>
                {temas.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between text-[13px]" style={{ color: "var(--color-text-subtle)" }}>
              <span>{filtrados.length} de {projetos.length} projeto(s)</span>
              {temFiltro && <button onClick={limpar} className="underline underline-offset-2" style={{ color: "var(--color-text-muted)" }}>Limpar filtros</button>}
            </div>
          </section>

          {filtrados.length === 0 ? (
            <div className="gip-glass p-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Nenhum projeto bate com os filtros. <button onClick={limpar} className="underline">Limpar</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filtrados.map((p) => {
                const st = STATUS[p.status] ?? { label: p.status, bg: "#F0F0EB", fg: "#5B606B" };
                const tema = temaDoProjeto(p);
                const corTema = corDoOrgao(tema);
                const virouLei = p.status === "promulgado";
                return (
                  <Link key={p.id} href={`/app/politico/projetos-lei/${p.id}`} className="gip-glass gip-glass-hover block p-5" style={{ borderLeft: `4px solid ${st.fg}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                          {p.numero} · {ESFERA[p.esfera] ?? p.esfera}
                        </div>
                        <h3 className="mt-0.5 font-semibold leading-snug">{p.titulo}</h3>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {virouLei && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#E2F5EC", color: "#17784F" }}>
                            <Trophy className="h-3 w-3" aria-hidden /> Virou Lei
                          </span>
                        )}
                        {!virouLei && (
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: corTema.bg, color: corTema.color }}>{tema}</span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>{p.coletiva ? "Coautoria" : "Autoria única"}</span>
                      {p.alinhamento && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "#E2F5EC", color: "#17784F" }}>Alinhado</span>
                      )}
                      {p.comissao && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>{p.comissao}</span>
                      )}
                    </div>

                    {/* Timeline de tramitação */}
                    <div className="mt-3 flex items-center gap-2 border-t pt-3 text-xs" style={{ borderColor: "var(--color-border)" }}>
                      <span style={{ color: "var(--color-text-subtle)" }}>Apresentado <strong style={{ color: "var(--color-text-muted)" }}>{data(p.dataApresentacao)}</strong></span>
                      <span style={{ color: "var(--color-text-subtle)" }}>→</span>
                      <span style={{ color: "var(--color-text-subtle)" }}>Últ. mov. <strong style={{ color: "var(--color-text-muted)" }}>{data(p.dataUltimaMov)}</strong></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

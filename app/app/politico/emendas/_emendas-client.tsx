"use client";

/**
 * Painel de Emendas Parlamentares (War Room 2.0): Indicadores no topo (3 números
 * grandes), ciclo do dinheiro, gráficos por ano/área/região, tabela filtrável e
 * o DIFERENCIAL — emenda × voto (onde investi × onde votei), que vem do TSE. A
 * lente muda com o mandato (deputado = município/região; vereador = bairro).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, Clock, Inbox, MapPin, TrendingUp, Users, Wallet } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";
import { RelatorioGabineteButton } from "@/components/politico/relatorio-gabinete-button";
import { SincronizarEmendasButton } from "@/components/politico/sincronizar-emendas-button";
import type { TipoMandato } from "@/lib/politico/emenda-painel";

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  solicitada: { label: "Pedido", bg: "#EDE9FE", fg: "#6D28D9" },
  rascunho: { label: "Rascunho", bg: "#F0F0EB", fg: "#5B606B" },
  indicada: { label: "Indicada", bg: "#E4E7F8", fg: "#2F3DA8" },
  empenhada: { label: "Empenhada", bg: "#FCF1DC", fg: "#8A5A10" },
  liquidada: { label: "Liquidada", bg: "#FDE8D4", fg: "#9A4A10" },
  paga: { label: "Paga", bg: "#E2F5EC", fg: "#17784F" },
  devolvida: { label: "Devolvida", bg: "#FBE4E2", fg: "#A3302A" },
  cancelada: { label: "Cancelada", bg: "#F0F0EB", fg: "#9A9D8F" },
};

const LEITURA_ROTULO: Record<string, { label: string; bg: string; fg: string }> = {
  fortaleza: { label: "Fortaleza", bg: "#E2F5EC", fg: "#17784F" },
  oportunidade: { label: "Oportunidade", bg: "#FCF1DC", fg: "#8A5A10" },
  acompanhar: { label: "Acompanhar", bg: "#EEF1F6", fg: "#5B606B" },
};

export interface EmendaItem {
  id: string;
  numero: string | null;
  ano: number;
  area: string;
  areaKey: string;
  status: string;
  municipio: string | null;
  bairro: string | null;
  entidade: string | null;
  modalidade: string | null;
  valorIndicado: string;
  valorPago: string;
}

interface Barra {
  name: string;
  value: number;
  fill: string;
}

export interface EmendasClientProps {
  tipo: TipoMandato;
  ehDeputado: boolean;
  kpis: { destinosAtendidos: number; totalIndicacoes: number; valorTotalIndicado: string };
  financeiro: { alocado: string; executado: string; pendente: string };
  pedidosAguardando: number;
  porArea: Barra[];
  porAno: Barra[];
  porRegiao: Barra[];
  emendas: EmendaItem[];
  votos: {
    temDados: boolean;
    resumo: { oportunidade: string; fortaleza: string; nOportunidade: number; nFortaleza: number };
    itens: { rotulo: string; valor: string; votos: number | null; pct: number | null; leitura: string | null }[];
  };
  ehAdmin?: boolean;
}

const TODOS = "__todos__";

export default function EmendasClient(props: EmendasClientProps) {
  const { tipo, ehDeputado, kpis, financeiro, pedidosAguardando, porArea, porAno, porRegiao, emendas, votos, ehAdmin } = props;

  const [fAno, setFAno] = useState<string>(TODOS);
  const [fArea, setFArea] = useState<string>(TODOS);
  const [fModalidade, setFModalidade] = useState<string>(TODOS);
  const [fStatus, setFStatus] = useState<string>(TODOS);
  const [busca, setBusca] = useState<string>("");

  const destinoLabel = ehDeputado ? "Municípios atendidos" : "Bairros atendidos";
  const regiaoTitulo = ehDeputado ? "Valor por região (R$)" : "Valor por bairro (R$)";
  const destinoCol = ehDeputado ? "Município" : "Bairro";

  const anos = useMemo(() => [...new Set(emendas.map((e) => e.ano))].sort((a, b) => b - a), [emendas]);
  const areas = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emendas) m.set(e.areaKey, e.area);
    return [...m.entries()];
  }, [emendas]);
  const modalidades = useMemo(
    () => [...new Set(emendas.map((e) => (e.modalidade ?? "").trim()).filter(Boolean))].sort(),
    [emendas],
  );
  const statusPresentes = useMemo(() => [...new Set(emendas.map((e) => e.status))], [emendas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return emendas.filter((e) => {
      if (fAno !== TODOS && String(e.ano) !== fAno) return false;
      if (fArea !== TODOS && e.areaKey !== fArea) return false;
      if (fModalidade !== TODOS && (e.modalidade ?? "") !== fModalidade) return false;
      if (fStatus !== TODOS && e.status !== fStatus) return false;
      if (q) {
        const alvo = `${e.municipio ?? ""} ${e.bairro ?? ""} ${e.entidade ?? ""} ${e.numero ?? ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [emendas, fAno, fArea, fModalidade, fStatus, busca]);

  const limparFiltros = () => {
    setFAno(TODOS);
    setFArea(TODOS);
    setFModalidade(TODOS);
    setFStatus(TODOS);
    setBusca("");
  };
  const temFiltro = fAno !== TODOS || fArea !== TODOS || fModalidade !== TODOS || fStatus !== TODOS || busca.trim() !== "";

  const coresPilulaPdf: Record<string, string> = Object.fromEntries(Object.values(STATUS).map((s) => [s.label, s.fg]));

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] px-4 py-7 space-y-6">
      <CommandHero
        eyebrow="Gabinete · Emendas"
        titulo="Emendas Parlamentares"
        subtitulo={ehDeputado ? "Indicações por município, região e área — do pedido à execução." : "Emendas da cidade por bairro e área — do pedido à execução."}
        acoes={[{ href: "/app/politico/emendas/novo", label: "+ Nova emenda", primary: true }]}
        extra={ehAdmin ? <SincronizarEmendasButton /> : undefined}
      />

      {emendas.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma emenda cadastrada"
          description="Cadastre a primeira emenda para acompanhar valores indicados, empenhados, pagos e o status de execução."
        />
      ) : (
        <>
          {/* Os 3 números grandes (Indicadores). */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label={destinoLabel} valor={String(kpis.destinosAtendidos)} icone={ehDeputado ? MapPin : Building2} />
            <KpiCard label="Total de indicações" valor={String(kpis.totalIndicacoes)} icone={Users} />
            <KpiCard label="Valor total indicado" valor={kpis.valorTotalIndicado} icone={Wallet} />
          </section>

          {/* Ciclo do dinheiro (nossa vantagem: não paramos no "pago"). */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Total alocado" valor={financeiro.alocado} icone={Wallet} />
            <KpiCard label="Executado (pago)" valor={financeiro.executado} icone={CheckCircle2} />
            <KpiCard label="Pendente" valor={financeiro.pendente} icone={Clock} />
          </section>

          {pedidosAguardando > 0 && (
            <div className="gip-glass flex items-center gap-3 p-4" style={{ borderLeft: "3px solid #6D28D9" }}>
              <Inbox className="h-5 w-5 shrink-0" style={{ color: "#6D28D9" }} />
              <p className="text-sm">
                <strong>{pedidosAguardando}</strong> pedido(s) de emenda aguardando decisão. Use o filtro de status <em>Pedido</em> abaixo para ver quem pediu o quê.
              </p>
            </div>
          )}

          {/* Diferencial: onde investi × onde votei (TSE). Só aparece se houver dado. */}
          {votos.temDados && (
            <section className="gip-glass p-5 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" style={{ color: "#2F3DA8" }} />
                <h3 className="text-sm font-semibold">Onde investi × onde votei</h3>
              </div>
              <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                Cruzamento das emendas com os votos do mandato por {ehDeputado ? "município" : "bairro"} (dados do TSE). <strong>Oportunidade</strong> = investiu onde quase não vota (semeia voto novo); <strong>Fortaleza</strong> = investiu onde já vota muito.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg p-3" style={{ background: "#FCF1DC" }}>
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8A5A10" }}>Oportunidade</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: "#8A5A10" }}>{votos.resumo.oportunidade}</div>
                  <div className="text-xs" style={{ color: "#8A5A10" }}>{votos.resumo.nOportunidade} destino(s)</div>
                </div>
                <div className="rounded-lg p-3" style={{ background: "#E2F5EC" }}>
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#17784F" }}>Fortaleza</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: "#17784F" }}>{votos.resumo.fortaleza}</div>
                  <div className="text-xs" style={{ color: "#17784F" }}>{votos.resumo.nFortaleza} destino(s)</div>
                </div>
              </div>
              {votos.itens.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ color: "var(--color-text-subtle)" }}>
                        <th className="py-1.5 pr-3 font-medium">{destinoCol}</th>
                        <th className="py-1.5 pr-3 font-medium">Investido</th>
                        <th className="py-1.5 pr-3 font-medium">Votos</th>
                        <th className="py-1.5 font-medium">Leitura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {votos.itens.map((c, i) => {
                        const l = c.leitura ? LEITURA_ROTULO[c.leitura] : null;
                        return (
                          <tr key={`${c.rotulo}-${i}`} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                            <td className="py-1.5 pr-3">{c.rotulo}</td>
                            <td className="py-1.5 pr-3 tabular-nums">{c.valor}</td>
                            <td className="py-1.5 pr-3 tabular-nums">
                              {c.votos == null ? "—" : c.votos.toLocaleString("pt-BR")}
                              {c.pct != null ? ` (${c.pct}%)` : ""}
                            </td>
                            <td className="py-1.5">
                              {l ? (
                                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: l.bg, color: l.fg }}>{l.label}</span>
                              ) : (
                                <span style={{ color: "var(--color-text-subtle)" }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Relatório PDF (reaproveita o motor do gabinete). */}
          <div className="flex justify-end">
            <RelatorioGabineteButton
              dados={{
                slug: "emendas",
                titulo: "Relatório de Emendas Parlamentares",
                resumo: `${emendas.length} emenda(s)`,
                kpis: [
                  { num: String(kpis.destinosAtendidos), label: destinoLabel },
                  { num: kpis.valorTotalIndicado, label: "Valor total indicado" },
                  { num: financeiro.executado, label: "Executado (pago)" },
                ],
                colunas: [
                  { header: "Número", largura: "10%" },
                  { header: "Ano", largura: "6%" },
                  { header: "Área", largura: "14%" },
                  { header: "Modalidade", largura: "14%" },
                  { header: destinoCol, largura: "14%" },
                  { header: "Entidade", largura: "16%" },
                  { header: "Status", largura: "10%", pilula: true },
                  { header: "Indicado", largura: "10%" },
                  { header: "Pago", largura: "10%" },
                ],
                coresPilula: coresPilulaPdf,
                linhas: emendas.map((e) => [
                  e.numero ?? "—",
                  String(e.ano),
                  e.area ?? "",
                  e.modalidade ?? "",
                  (ehDeputado ? e.municipio : e.bairro) ?? "",
                  e.entidade ?? "",
                  STATUS[e.status]?.label ?? e.status,
                  e.valorIndicado,
                  e.valorPago,
                ]),
              }}
            />
          </div>

          {/* Gráficos didáticos. */}
          {porAno.length > 0 && <BarChartCard title="Valor indicado por ano (R$)" data={porAno} horizontal height={Math.max(220, porAno.length * 44)} />}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {porArea.length > 0 && <BarChartCard title="Valor por área (R$)" data={porArea} horizontal height={320} />}
            {porRegiao.length > 0 && <BarChartCard title={regiaoTitulo} data={porRegiao} horizontal height={320} />}
          </div>

          {/* Filtros (como os melhores sistemas de gabinete). */}
          <section className="gip-glass p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={`Buscar ${ehDeputado ? "município" : "bairro"}, entidade ou número`}
                className="wr-input sm:col-span-2 lg:col-span-1"
              />
              <select value={fAno} onChange={(e) => setFAno(e.target.value)} className="wr-input">
                <option value={TODOS}>Ano: todos</option>
                {anos.map((a) => <option key={a} value={String(a)}>{a}</option>)}
              </select>
              <select value={fArea} onChange={(e) => setFArea(e.target.value)} className="wr-input">
                <option value={TODOS}>Área: todas</option>
                {areas.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <select value={fModalidade} onChange={(e) => setFModalidade(e.target.value)} className="wr-input">
                <option value={TODOS}>Modalidade: todas</option>
                {modalidades.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="wr-input">
                <option value={TODOS}>Status: todos</option>
                {statusPresentes.map((s) => <option key={s} value={s}>{STATUS[s]?.label ?? s}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{filtradas.length} de {emendas.length} emenda(s)</span>
              {temFiltro && (
                <button onClick={limparFiltros} className="text-xs font-medium underline" style={{ color: "var(--color-text-subtle)" }}>Limpar filtros</button>
              )}
            </div>
          </section>

          {/* Cards. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtradas.map((e) => {
              const st = STATUS[e.status] ?? { label: e.status, bg: "#F0F0EB", fg: "#5B606B" };
              const destino = (ehDeputado ? e.municipio : e.bairro) || e.municipio || e.bairro || e.entidade || "—";
              return (
                <Link key={e.id} href={`/app/politico/emendas/${e.id}`} className="gip-glass gip-glass-hover flex flex-col gap-2.5 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                        {e.numero ?? "s/nº"} · {e.ano}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-medium">{destino}</div>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="w-fit rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>{e.area}</span>
                    {e.modalidade && (
                      <span className="w-fit rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>{e.modalidade}</span>
                    )}
                  </div>
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

"use client";

/**
 * Lista de Obras & Fiscalização. Filtros por natureza/status, KPIs e cards.
 * Didático: rótulos claros e uma explicação do que é o módulo.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info, Plus, MapPin, HardHat, ShieldCheck, Search, Loader2, Target, X } from "lucide-react";

import type { EleicaoOpcao } from "@/app/actions/politico/intelEleitoral";
import { rankingCandidatos, type CandidatoRank } from "@/app/actions/politico/raioX";
import { salvarMandatoTse, type MandatoTse } from "@/app/actions/politico/obras-actions";
import { CandFoto } from "@/components/politico/cand-foto";

export interface ObraRow {
  id: string;
  titulo: string;
  natureza: "execucao" | "fiscalizacao";
  tipo: string;
  area_tematica: string | null;
  status: string;
  percentual: number;
  valor_cents: number;
  municipio: string | null;
  bairro: string | null;
  prioridade: string;
  data_prevista: string | null;
  orgao_responsavel: string | null;
  empresa_nome: string | null;
  created_at: string;
}

export const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  planejada: { label: "Planejada", bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" },
  em_andamento: { label: "Em andamento", bg: "rgba(215,243,106,0.16)", color: "#D7F36A" },
  paralisada: { label: "Paralisada", bg: "rgba(224,128,121,0.16)", color: "#E08079" },
  concluida: { label: "Concluída", bg: "rgba(23,120,79,0.20)", color: "#58C08A" },
  cancelada: { label: "Cancelada", bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" },
};
export const TIPO: Record<string, string> = { obra: "Obra", servico: "Serviço", contrato: "Contrato", convenio: "Convênio", equipamento: "Equipamento", programa: "Programa", outro: "Outro" };

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function ObrasClient({ obras, executivo, eleicoes, mandatoInicial }: { obras: ObraRow[]; executivo: boolean; eleicoes: EleicaoOpcao[]; mandatoInicial: MandatoTse | null }) {
  const [fNat, setFNat] = useState<"todas" | "execucao" | "fiscalizacao">("todas");
  const [fStatus, setFStatus] = useState<string>("todos");

  const filtradas = useMemo(
    () => obras.filter((o) => (fNat === "todas" || o.natureza === fNat) && (fStatus === "todos" || o.status === fStatus)),
    [obras, fNat, fStatus],
  );

  const emAndamento = obras.filter((o) => o.status === "em_andamento").length;
  const concluidas = obras.filter((o) => o.status === "concluida").length;
  const paralisadas = obras.filter((o) => o.status === "paralisada").length;
  const valorTotal = obras.reduce((s, o) => s + (o.valor_cents || 0), 0);

  return (
    <div className="space-y-4">
      <MandatoStrip eleicoes={eleicoes} inicial={mandatoInicial} />

      {/* Explicação didática */}
      <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden style={{ color: "#D7F36A" }} />
        <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
          Cada card é uma <strong style={{ color: "#fff" }}>obra, serviço ou contrato público</strong> num território.
          Marque a <strong style={{ color: "#fff" }}>natureza</strong>: <strong style={{ color: "#fff" }}>Fiscalização</strong> (você acompanha e cobra o que o poder público faz — com vistorias, checklist e fotos)
          ou <strong style={{ color: "#fff" }}>Execução</strong> (você/seu órgão gerencia o contrato — fornecedor, valor, prazo e entrega).
          Dá para vincular à <strong style={{ color: "#fff" }}>emenda</strong> que bancou e ao <strong style={{ color: "#fff" }}>bairro</strong> (peso eleitoral).
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Total" value={String(obras.length)} sub="obras & contratos" />
        <Kpi label="Em andamento" value={String(emAndamento)} sub={paralisadas ? `${paralisadas} paralisada(s)` : "em execução"} accent="#D7F36A" />
        <Kpi label="Concluídas" value={String(concluidas)} sub="entregues" accent="#58C08A" />
        <Kpi label="Valor acompanhado" value={brl(valorTotal)} sub="soma dos contratos" />
      </div>

      {/* Filtros + Nova */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full p-0.5" style={{ border: "1px solid rgba(255,255,255,0.18)" }}>
          {([["todas", "Todas"], ["fiscalizacao", "Fiscalização"], ["execucao", "Execução"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFNat(v)}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
              style={fNat === v ? { background: "#D7F36A", color: "#14181F" } : { color: "rgba(255,255,255,0.75)" }}>{l}</button>
          ))}
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="wr-input h-9 py-0 text-sm">
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <Link href="/app/politico/obras/nova"
          className="ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: "#D7F36A", color: "#16181D" }}>
          <Plus className="h-4 w-4" aria-hidden /> Nova {executivo ? "obra/contrato" : "fiscalização"}
        </Link>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="wr-card p-12 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
          {obras.length === 0 ? "Nenhuma obra cadastrada ainda. Clique em “Nova” para começar." : "Nenhuma obra para esse filtro."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtradas.map((o) => {
            const st = STATUS[o.status] ?? STATUS.planejada;
            return (
              <Link key={o.id} href={`/app/politico/obras/${o.id}`}
                className="wr-card block p-4 transition-colors hover:border-[rgba(215,243,106,0.4)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: o.natureza === "execucao" ? "#7da9bf" : "#D7F36A" }}>
                    {o.natureza === "execucao" ? <HardHat className="h-3.5 w-3.5" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
                    {o.natureza === "execucao" ? "Execução" : "Fiscalização"} · {TIPO[o.tipo] ?? o.tipo}
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <h3 className="mt-1.5 font-heading text-base font-bold leading-snug" style={{ color: "var(--color-text)" }}>{o.titulo}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {(o.bairro || o.municipio) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{[o.bairro, o.municipio].filter(Boolean).join(" · ")}</span>}
                  {o.valor_cents > 0 && <span>{brl(o.valor_cents)}</span>}
                  {o.orgao_responsavel && <span className="truncate">{o.orgao_responsavel}</span>}
                </div>
                {(o.status === "em_andamento" || o.percentual > 0) && (
                  <div className="mt-2.5">
                    <div className="mb-1 flex justify-between text-[11px]" style={{ color: "var(--color-text-subtle)" }}><span>Execução</span><span className="tabular-nums">{o.percentual}%</span></div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full" style={{ width: `${o.percentual}%`, background: "#D7F36A" }} />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Faixa "Meu mandato": vincula a conta ao candidato TSE p/ ver votos por obra.
function MandatoStrip({ eleicoes, inicial }: { eleicoes: EleicaoOpcao[]; inicial: MandatoTse | null }) {
  const [mandato, setMandato] = useState<MandatoTse | null>(inicial);
  const [abrir, setAbrir] = useState(false);
  const [eleicaoId, setEleicaoId] = useState(eleicoes[0]?.id ?? 0);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<CandidatoRank[]>([]);
  const [buscando, setBuscando] = useState(false);
  const ano = eleicoes.find((e) => e.id === eleicaoId)?.ano ?? 0;

  async function buscar(termo: string) {
    setQ(termo);
    if (termo.trim().length < 2) { setRes([]); return; }
    setBuscando(true);
    setRes(await rankingCandidatos(eleicaoId, termo.trim(), 20));
    setBuscando(false);
  }
  async function escolher(c: CandidatoRank) {
    await salvarMandatoTse(eleicaoId, c.sq, c.nomeUrna);
    setMandato({ electionId: eleicaoId, sq: c.sq, nome: c.nomeUrna });
    setAbrir(false); setQ(""); setRes([]);
  }

  if (mandato && !abrir) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: "rgba(215,243,106,0.08)", border: "1px solid rgba(215,243,106,0.3)" }}>
        <Target className="h-4 w-4 shrink-0" aria-hidden style={{ color: "#D7F36A" }} />
        <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.8)" }}>Mandato vinculado: <strong style={{ color: "#fff" }}>{mandato.nome}</strong> — cada obra mostra os votos que você fez no bairro.</span>
        <button type="button" onClick={() => setAbrir(true)} className="ml-auto text-xs font-semibold" style={{ color: "#D7F36A" }}>trocar</button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl p-3.5" style={{ background: "rgba(215,243,106,0.06)", border: "1px dashed rgba(215,243,106,0.4)" }}>
      <div className="flex items-center gap-2 text-[13px]" style={{ color: "rgba(255,255,255,0.8)" }}>
        <Target className="h-4 w-4 shrink-0" aria-hidden style={{ color: "#D7F36A" }} />
        <strong style={{ color: "#fff" }}>Vincule seu mandato (TSE)</strong> para ver, em cada obra, os votos que você fez naquele bairro — o ROI do recurso.
        {mandato && <button type="button" onClick={() => setAbrir(false)} className="ml-auto"><X className="h-4 w-4" style={{ color: "var(--color-text-subtle)" }} /></button>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <select value={eleicaoId} onChange={(e) => { setEleicaoId(Number(e.target.value)); setRes([]); setQ(""); }} className="wr-input h-9 py-0 text-sm" style={{ minWidth: 180 }}>
          {eleicoes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
          <input value={q} onChange={(e) => buscar(e.target.value)} placeholder="Buscar seu nome na urna ou número" className="wr-input w-full pl-9" />
        </div>
        {buscando && <Loader2 className="mb-2 h-4 w-4 animate-spin" aria-hidden style={{ color: "var(--color-text-subtle)" }} />}
      </div>
      {res.length > 0 && (
        <ul className="max-h-[260px] overflow-y-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
          {res.map((c) => (
            <li key={c.sq}>
              <button type="button" onClick={() => escolher(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.06)]">
                <CandFoto sq={c.sq} ano={ano} nome={c.nomeUrna} size={30} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold" style={{ color: "#fff" }}>{c.nomeUrna}</div><div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{c.nr}{c.partido ? ` · ${c.partido}` : ""} · {c.votos.toLocaleString("pt-BR")} votos</div></div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-[18px] p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</div>
      <div className="mt-0.5 font-heading text-[22px] font-bold tabular-nums" style={{ color: accent ?? "#fff" }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>{sub}</div>}
    </div>
  );
}

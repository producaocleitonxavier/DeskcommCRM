"use client";

/**
 * Arena Comparativa (client). Eleição + município → ranking para escolher 2–3
 * candidatos → comparação lado a lado por bairro/local/zona/seção (votos, % e
 * posição de cada um em cada localidade). Dados via server actions (RLS).
 */

import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, Search, Swords, X } from "lucide-react";

import type { EleicaoOpcao } from "@/app/actions/politico/intelEleitoral";
import { CandFoto } from "@/components/politico/cand-foto";
import {
  rankingCandidatosMun,
  comparativo,
  type CandidatoRank,
  type ComparativoLinha,
  type MunicipioOpcao,
} from "@/app/actions/politico/raioX";

type Dim = "bairro" | "local" | "zona" | "secao";
const DIMS: { key: Dim; label: string }[] = [
  { key: "bairro", label: "Bairro" },
  { key: "local", label: "Local" },
  { key: "zona", label: "Zona" },
  { key: "secao", label: "Seção" },
];
const CORES = ["#D7F36A", "#7da9bf", "#d09455"]; // até 3 candidatos

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(2)}%` : "—";
}

export default function ComparativoClient({ eleicoes, municipios }: { eleicoes: EleicaoOpcao[]; municipios: MunicipioOpcao[] }) {
  const [eleicaoId, setEleicaoId] = useState(eleicoes[0]!.id);
  const [munTse, setMunTse] = useState("");
  const [q, setQ] = useState("");
  const [ranking, setRanking] = useState<CandidatoRank[]>([]);
  const [sel, setSel] = useState<CandidatoRank[]>([]);
  const [dim, setDim] = useState<Dim>("bairro");
  const [comp, setComp] = useState<ComparativoLinha[]>([]);
  const [carregando, inicia] = useTransition();
  const eleicaoAno = eleicoes.find((e) => e.id === eleicaoId)?.ano ?? 0;

  function carregarRanking(id: number, mun: string, termo: string) {
    if (!mun) { setRanking([]); return; }
    inicia(async () => setRanking(await rankingCandidatosMun(id, mun, termo, 60)));
  }
  function trocarEleicao(id: number) { setEleicaoId(id); setSel([]); setComp([]); carregarRanking(id, munTse, q.trim()); }
  function trocarMun(mun: string) { setMunTse(mun); setSel([]); setComp([]); carregarRanking(eleicaoId, mun, q.trim()); }

  function toggle(c: CandidatoRank) {
    setSel((cur) => {
      const existe = cur.some((x) => x.sq === c.sq);
      const prox = existe ? cur.filter((x) => x.sq !== c.sq) : cur.length >= 3 ? cur : [...cur, c];
      if (prox.length >= 2) carregarComp(prox, dim);
      else setComp([]);
      return prox;
    });
  }
  function carregarComp(selecionados: CandidatoRank[], d: Dim) {
    inicia(async () => setComp(await comparativo(eleicaoId, munTse, d, selecionados.map((s) => s.sq))));
  }
  function trocarDim(d: Dim) { setDim(d); if (sel.length >= 2) carregarComp(sel, d); }

  const corDe = (sq: string) => CORES[sel.findIndex((s) => s.sq === sq)] ?? "#9CA3AF";

  // pivot: localidade -> {rotulo, universo, votosPorSq}
  const linhas = useMemo(() => {
    const m = new Map<string, { rotulo: string; universo: number; votos: Map<string, number> }>();
    for (const r of comp) {
      let e = m.get(r.chave);
      if (!e) { e = { rotulo: r.rotulo, universo: r.universo, votos: new Map() }; m.set(r.chave, e); }
      e.votos.set(r.sq, r.votos);
    }
    const soma = (e: { votos: Map<string, number> }) => sel.reduce((s, c) => s + (e.votos.get(c.sq) ?? 0), 0);
    return [...m.entries()]
      .map(([chave, v]) => ({ chave, ...v }))
      .sort((a, b) => soma(b) - soma(a));
  }, [comp, sel]);

  const munNome = municipios.find((m) => m.tse === munTse)?.nome ?? "";

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Eleição</span>
          <select value={eleicaoId} onChange={(e) => trocarEleicao(Number(e.target.value))} className="wr-input min-w-[220px]">
            {eleicoes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Município</span>
          <select value={munTse} onChange={(e) => trocarMun(e.target.value)} className="wr-input min-w-[220px]">
            <option value="">Selecione…</option>
            {municipios.map((m) => <option key={m.tse} value={m.tse}>{m.nome}</option>)}
          </select>
        </label>
        {munTse && (
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Buscar candidato</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
              <input value={q} onChange={(e) => { setQ(e.target.value); carregarRanking(eleicaoId, munTse, e.target.value.trim()); }} placeholder="Nome ou número" className="wr-input w-full pl-9" />
            </div>
          </label>
        )}
        {carregando && <Loader2 className="mb-2 h-4 w-4 animate-spin" aria-hidden style={{ color: "var(--color-text-subtle)" }} />}
      </div>

      {!munTse ? (
        <div className="wr-card p-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
          Selecione um município para montar a comparação.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]">
          {/* Escolher candidatos */}
          <section className="wr-card flex flex-col p-0">
            <div className="px-5 pt-4 pb-2">
              <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Candidatos — {munNome}</h3>
              <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Clique para comparar (até 3)</p>
            </div>
            <ul className="max-h-[560px] overflow-y-auto">
              {ranking.map((c) => {
                const ativo = sel.some((x) => x.sq === c.sq);
                return (
                  <li key={c.sq}>
                    <button type="button" onClick={() => toggle(c)}
                      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                      style={{ borderTop: "1px solid var(--color-border)", ...(ativo ? { background: "rgba(215,243,106,0.12)" } : {}) }}>
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{c.posicao}</span>
                      <CandFoto sq={c.sq} ano={eleicaoAno} nome={c.nomeUrna} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>{c.nomeUrna}</div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{c.nr}{c.partido ? ` · ${c.partido}` : ""} · {c.votos.toLocaleString("pt-BR")} votos</div>
                      </div>
                      {ativo ? <X className="h-4 w-4 shrink-0" aria-hidden style={{ color: "#A3302A" }} /> : <Plus className="h-4 w-4 shrink-0" aria-hidden style={{ color: "#5C7F23" }} />}
                    </button>
                  </li>
                );
              })}
              {ranking.length === 0 && <li className="p-8 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>{carregando ? "Carregando…" : "Nenhum candidato."}</li>}
            </ul>
          </section>

          {/* Comparação */}
          <section className="wr-card flex flex-col p-0">
            {sel.length < 2 ? (
              <div className="flex flex-1 items-center justify-center p-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
                <div>
                  <Swords className="mx-auto mb-2 h-6 w-6" aria-hidden style={{ color: "#5C7F23" }} />
                  Selecione pelo menos 2 candidatos à esquerda para comparar.
                </div>
              </div>
            ) : (
              <>
                {/* Cabeçalho dos selecionados */}
                <div className="flex flex-wrap gap-2 px-5 pt-4 pb-3">
                  {sel.map((c) => (
                    <div key={c.sq} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5" style={{ border: `1px solid ${corDe(c.sq)}`, background: "rgba(0,0,0,0.02)" }}>
                      <CandFoto sq={c.sq} ano={eleicaoAno} nome={c.nomeUrna} size={26} />
                      <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>{c.nomeUrna}</span>
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: corDe(c.sq) }} aria-hidden />
                      <button type="button" onClick={() => toggle(c)} aria-label="remover"><X className="h-3.5 w-3.5" style={{ color: "var(--color-text-subtle)" }} /></button>
                    </div>
                  ))}
                </div>
                {/* Tabs de dimensão */}
                <div className="flex gap-1 border-b px-4 pb-2" style={{ borderColor: "var(--color-border)" }}>
                  {DIMS.map((d) => (
                    <button key={d.key} type="button" onClick={() => trocarDim(d.key)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={dim === d.key ? { background: "#16181D", color: "#FFFFFF" } : { color: "var(--color-text-muted)" }}>
                      {d.label}
                    </button>
                  ))}
                </div>
                {/* Tabela comparativa */}
                <div className="overflow-auto" style={{ maxHeight: 520 }}>
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: "var(--color-surface)" }}>
                      <tr>
                        <th className="px-4 py-2.5 text-left text-[12px] font-medium" style={{ color: "var(--color-text-subtle)", borderBottom: "1px solid var(--color-border)" }}>{DIMS.find((d) => d.key === dim)?.label}</th>
                        {sel.map((c) => (
                          <th key={c.sq} className="px-3 py-2.5 text-right text-[12px] font-semibold" style={{ color: corDe(c.sq), borderBottom: "1px solid var(--color-border)" }}>{c.nomeUrna.split(" ")[0]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => {
                        const ordenados = [...sel].sort((a, b) => (l.votos.get(b.sq) ?? 0) - (l.votos.get(a.sq) ?? 0));
                        const posDe = (sq: string) => ordenados.findIndex((c) => c.sq === sq) + 1;
                        return (
                          <tr key={l.chave} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text)" }}>{l.rotulo}</td>
                            {sel.map((c) => {
                              const v = l.votos.get(c.sq) ?? 0;
                              const pos = posDe(c.sq);
                              return (
                                <td key={c.sq} className="px-3 py-2.5 text-right tabular-nums">
                                  <div className="font-bold" style={{ color: pos === 1 ? "#17784F" : "var(--color-text)" }}>{v.toLocaleString("pt-BR")}</div>
                                  <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{pct(v, l.universo)} · {pos}º</div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {linhas.length === 0 && <tr><td colSpan={sel.length + 1} className="p-8 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>{carregando ? "Carregando…" : "Sem dados nessa dimensão."}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

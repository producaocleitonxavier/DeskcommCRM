"use client";

/**
 * Projeção de Cadeiras (QE/QP) — GIP. Simulador de eleição proporcional: QE,
 * QP por partido, distribuição de sobras (80%/20%) e "quantos votos faltam" para
 * um candidato entrar. Base = votos nominais do último pleito (aproximação, sem
 * legenda/federação). Cálculo 100% no cliente → simulação instantânea.
 */

import { useMemo, useState, useTransition } from "react";
import { Landmark, Info, Search, Target } from "lucide-react";
import type { MunicipioOpcao } from "@/app/actions/politico/raioX";
import { dadosCadeiras, type DadosCadeiras, type CandidatoCadeira } from "@/app/actions/politico/projecaoCadeiras";

interface EleicaoOpt { id: number; label: string; cargoCod: number; ano: number }

interface PartidoResult {
  sigla: string; votos: number; qp: number; sobras: number; cadeiras: number; candidatos: CandidatoCadeira[];
}
interface Alocacao { qe: number; vv: number; seats: number; partidos: PartidoResult[]; naoDistribuidas: number }

function alocar(cands: CandidatoCadeira[], seats: number, override?: { sq: string; votos: number }): Alocacao {
  const lista = override ? cands.map((c) => (c.sq === override.sq ? { ...c, votos: override.votos } : c)) : cands;
  const vv = lista.reduce((s, c) => s + c.votos, 0);
  if (seats <= 0 || vv <= 0) return { qe: 0, vv, seats, partidos: [], naoDistribuidas: 0 };
  const qe = Math.floor(vv / seats);
  const map = new Map<string, CandidatoCadeira[]>();
  for (const c of lista) { const a = map.get(c.partido) ?? []; a.push(c); map.set(c.partido, a); }
  const partidos: PartidoResult[] = [...map.entries()].map(([sigla, candidatos]) => {
    const votos = candidatos.reduce((s, c) => s + c.votos, 0);
    const qp = qe > 0 ? Math.floor(votos / qe) : 0;
    return { sigla, votos, qp, sobras: 0, cadeiras: qp, candidatos: [...candidatos].sort((a, b) => b.votos - a.votos) };
  });
  let remaining = seats - partidos.reduce((s, p) => s + p.qp, 0);
  const limiarPartido = 0.8 * qe, limiarCand = 0.1 * qe;
  let guard = 0;
  while (remaining > 0 && guard++ < 2000) {
    let best: PartidoResult | null = null, bestM = -1;
    for (const p of partidos) {
      if (p.votos < limiarPartido || p.cadeiras >= p.candidatos.length) continue;
      const prox = p.candidatos[p.cadeiras];
      if (!prox || prox.votos < limiarCand) continue;
      const m = p.votos / (p.cadeiras + 1);
      if (m > bestM) { bestM = m; best = p; }
    }
    if (!best) break;
    best.sobras++; best.cadeiras++; remaining--;
  }
  partidos.sort((a, b) => b.cadeiras - a.cadeiras || b.votos - a.votos);
  return { qe, vv, seats, partidos, naoDistribuidas: remaining };
}

function dentro(aloc: Alocacao, sq: string): boolean {
  for (const p of aloc.partidos) {
    const idx = p.candidatos.findIndex((c) => c.sq === sq);
    if (idx >= 0) return idx < p.cadeiras;
  }
  return false;
}

function votosParaEntrar(cands: CandidatoCadeira[], seats: number, sq: string): number {
  const base = cands.find((c) => c.sq === sq);
  if (!base) return 0;
  if (dentro(alocar(cands, seats), sq)) return 0;
  const step = Math.max(25, Math.round(base.votos * 0.02) || 25);
  let extra = step;
  for (let i = 0; i < 400; i++) {
    if (dentro(alocar(cands, seats, { sq, votos: base.votos + extra }), sq)) return extra;
    extra += step;
  }
  return -1; // não alcançou no range simulado
}

function moeda0(n: number): string { return n.toLocaleString("pt-BR"); }

const CORES = ["#D7F36A", "#60A5FA", "#F59E0B", "#22C55E", "#A78BFA", "#F472B6", "#38BDF8", "#FB923C", "#4ADE80", "#E879F9"];

export default function CadeirasClient({ eleicoes, municipios }: { eleicoes: EleicaoOpt[]; municipios: MunicipioOpcao[] }) {
  const [electionId, setElectionId] = useState<number | "">("");
  const [municipioTse, setMunicipioTse] = useState("");
  const [dados, setDados] = useState<DadosCadeiras | null>(null);
  const [selSq, setSelSq] = useState("");
  const [sim, setSim] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  const [carregando, start] = useTransition();

  const elAtual = eleicoes.find((e) => e.id === electionId);
  const precisaMunicipio = elAtual?.cargoCod === 13;

  function carregar(elId: number, muni: string) {
    const el = eleicoes.find((e) => e.id === elId);
    if (!el) return;
    if (el.cargoCod === 13 && !muni) { setDados(null); return; }
    const escopo = el.cargoCod === 13 ? (municipios.find((m) => m.tse === muni)?.nome ?? "Município") : "Minas Gerais";
    start(async () => {
      const d = await dadosCadeiras(elId, el.cargoCod === 13 ? muni : null, escopo);
      setDados(d); setSelSq(""); setSim(null); setBusca("");
    });
  }

  const alocBase = useMemo(() => (dados ? alocar(dados.candidatos, dados.cadeiras) : null), [dados]);
  const alocSim = useMemo(() => {
    if (!dados || !selSq || sim === null) return null;
    return alocar(dados.candidatos, dados.cadeiras, { sq: selSq, votos: sim });
  }, [dados, selSq, sim]);
  const alocEfetiva = alocSim ?? alocBase;

  const candSel = dados?.candidatos.find((c) => c.sq === selSq) ?? null;
  const partidoSel = alocEfetiva?.partidos.find((p) => p.candidatos.some((c) => c.sq === selSq)) ?? null;
  const posSel = partidoSel?.candidatos.findIndex((c) => c.sq === selSq) ?? -1;
  const dentroSel = alocEfetiva && selSq ? dentro(alocEfetiva, selSq) : false;
  const faltam = useMemo(() => (dados && selSq ? votosParaEntrar(dados.candidatos, dados.cadeiras, selSq) : 0), [dados, selSq]);

  const resultadosBusca = useMemo(() => {
    if (!dados || busca.trim().length < 2) return [];
    const q = busca.toLowerCase();
    return dados.candidatos.filter((c) => c.nome.toLowerCase().includes(q)).slice(0, 8);
  }, [dados, busca]);

  const maxCad = alocEfetiva ? Math.max(...alocEfetiva.partidos.map((p) => p.cadeiras), 1) : 1;

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-7 space-y-4">
      <header className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(215,243,106,0.16)", color: "#7E8F2B" }} aria-hidden><Landmark className="h-5 w-5" /></span>
        <div>
          <h1 className="font-heading text-[26px] font-bold leading-tight" style={{ color: "var(--color-text)" }}>Projeção de Cadeiras</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Quociente eleitoral e partidário: quantos votos pegam a cadeira — e quanto falta pra você entrar.</p>
        </div>
      </header>

      {/* Seletores */}
      <section className="wr-card p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Eleição</span>
            <select value={electionId} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ""; setElectionId(v); setMunicipioTse(""); if (v && eleicoes.find((x) => x.id === v)?.cargoCod !== 13) carregar(v, ""); else setDados(null); }} className="wr-input w-full">
              <option value="">Escolha a eleição…</option>
              {eleicoes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </label>
          {precisaMunicipio && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Município (Câmara)</span>
              <select value={municipioTse} onChange={(e) => { setMunicipioTse(e.target.value); if (electionId) carregar(Number(electionId), e.target.value); }} className="wr-input w-full">
                <option value="">Escolha o município…</option>
                {municipios.map((m) => <option key={m.tse} value={m.tse}>{m.nome}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      {carregando && <div className="wr-card p-6 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>Calculando o quociente…</div>}

      {!carregando && alocEfetiva && dados && (
        alocEfetiva.seats === 0 || alocEfetiva.qe === 0 ? (
          <div className="wr-card p-6 text-sm" style={{ color: "var(--color-text-subtle)" }}>Sem dados suficientes para este recorte.</div>
        ) : (
          <>
            {/* KPIs do quociente */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi valor={moeda0(alocEfetiva.qe)} label="Quociente eleitoral" sub="votos por cadeira" destaque />
              <Kpi valor={String(alocEfetiva.seats)} label="Cadeiras em disputa" sub={dados.escopo} />
              <Kpi valor={moeda0(alocEfetiva.vv)} label="Votos nominais" sub="válidos (sem legenda)" />
              <Kpi valor={String(alocEfetiva.partidos.filter((p) => p.cadeiras > 0).length)} label="Partidos com cadeira" />
            </section>

            <div className="flex items-start gap-2 rounded-xl px-4 py-2.5 text-xs" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", color: "var(--color-text-muted)" }}>
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#60A5FA" }} aria-hidden />
              <span>Simulação sobre os <strong style={{ color: "var(--color-text)" }}>votos nominais do pleito de {elAtual?.ano}</strong>. Não inclui votos de legenda nem agrupa federações — use como planejamento (&quot;quantos votos preciso&quot;), não como apuração oficial.</span>
            </div>

            {/* Simulador por candidato */}
            <section className="wr-card p-5">
              <div className="mb-3 flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--color-text)" }}><Target className="h-4 w-4" style={{ color: "#D7F36A" }} aria-hidden /> Simule o seu candidato</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busque o candidato pelo nome…" className="wr-input w-full" style={{ paddingLeft: 36 }} />
                {resultadosBusca.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-[260px] w-full overflow-y-auto rounded-xl py-1 shadow-xl" style={{ background: "#1a1d24", border: "1px solid rgba(255,255,255,0.12)" }}>
                    {resultadosBusca.map((c) => (
                      <li key={c.sq}>
                        <button type="button" onClick={() => { setSelSq(c.sq); setSim(c.votos); setBusca(""); }} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.06)]" style={{ color: "#E8E8E4" }}>
                          <span className="truncate">{c.nome} <span style={{ opacity: 0.6 }}>· {c.partido}</span></span>
                          <span className="shrink-0 tabular-nums" style={{ opacity: 0.6 }}>{moeda0(c.votos)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {candSel && partidoSel && (
                <div className="mt-4 rounded-xl p-4" style={{ background: dentroSel ? "rgba(34,197,94,0.08)" : "rgba(248,113,113,0.07)", border: `1px solid ${dentroSel ? "rgba(34,197,94,0.3)" : "rgba(248,113,113,0.3)"}` }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-heading text-lg font-bold" style={{ color: "var(--color-text)" }}>{candSel.nome} <span className="text-sm font-medium" style={{ color: "var(--color-text-subtle)" }}>· {candSel.partido}</span></div>
                      <div className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{posSel + 1}º no partido · partido projeta <strong style={{ color: "var(--color-text)" }}>{partidoSel.cadeiras}</strong> cadeira(s)</div>
                    </div>
                    <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: dentroSel ? "rgba(34,197,94,0.16)" : "rgba(248,113,113,0.16)", color: dentroSel ? "#22C55E" : "#F87171" }}>
                      {dentroSel ? "Eleito (projeção)" : "Suplente (projeção)"}
                    </span>
                  </div>

                  {/* slider de votos */}
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs" style={{ color: "var(--color-text-subtle)" }}>
                      <span>Votos simulados</span>
                      <span className="tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>{moeda0(sim ?? candSel.votos)}</span>
                    </div>
                    <input type="range" min={0} max={Math.max(candSel.votos * 3, alocEfetiva.qe * 2)} step={25} value={sim ?? candSel.votos} onChange={(e) => setSim(Number(e.target.value))} className="w-full accent-[#D7F36A]" />
                    <div className="mt-1 flex items-center justify-between text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                      <span>real: {moeda0(candSel.votos)} {candSel.eleitoReal ? "· eleito de fato" : "· não eleito"}</span>
                      {sim !== null && sim !== candSel.votos && <button type="button" onClick={() => setSim(candSel.votos)} className="font-semibold" style={{ color: "#60A5FA" }}>resetar</button>}
                    </div>
                  </div>

                  {!dentroSel && faltam > 0 && (
                    <div className="mt-3 text-sm" style={{ color: "var(--color-text)" }}>
                      Faltam <strong style={{ color: "#D7F36A" }}>~{moeda0(faltam)} votos</strong> para entrar (mantendo os demais). Arraste acima para simular.
                    </div>
                  )}
                  {!dentroSel && faltam === -1 && <div className="mt-3 text-sm" style={{ color: "var(--color-text-subtle)" }}>Entrada exige um salto grande de votos neste cenário.</div>}
                </div>
              )}
            </section>

            {/* Composição por partido */}
            <section className="wr-card p-5">
              <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--color-text)" }}>Composição projetada</h2>
              <div className="flex flex-col gap-2">
                {alocEfetiva.partidos.filter((p) => p.cadeiras > 0 || p.votos >= alocEfetiva.qe * 0.5).slice(0, 14).map((p, i) => {
                  const destaca = partidoSel?.sigla === p.sigla;
                  return (
                    <div key={p.sigla} className="flex items-center gap-3" style={{ opacity: destaca || !partidoSel ? 1 : 0.6 }}>
                      <span className="w-20 shrink-0 text-sm font-semibold" style={{ color: destaca ? "#D7F36A" : "var(--color-text)" }}>{p.sigla}</span>
                      <div className="flex h-5 flex-1 items-center overflow-hidden rounded-md" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="h-full" style={{ width: `${(p.cadeiras / maxCad) * 100}%`, background: CORES[i % CORES.length], minWidth: p.cadeiras > 0 ? 24 : 0 }} />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
                        <strong style={{ color: "var(--color-text)" }}>{p.cadeiras}</strong> cad · {moeda0(p.votos)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {alocEfetiva.naoDistribuidas > 0 && <p className="mt-2 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{alocEfetiva.naoDistribuidas} cadeira(s) sem partido elegível no critério (raro).</p>}
            </section>
          </>
        )
      )}

      {!carregando && !dados && (
        <div className="wr-card p-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
          Escolha uma eleição proporcional{precisaMunicipio ? " e o município" : ""} para projetar as cadeiras.
        </div>
      )}
    </div>
  );
}

function Kpi({ valor, label, sub, destaque }: { valor: string; label: string; sub?: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: destaque ? "rgba(215,243,106,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${destaque ? "rgba(215,243,106,0.3)" : "var(--color-border)"}` }}>
      <div className="font-heading text-2xl font-bold tabular-nums leading-none" style={{ color: destaque ? "#D7F36A" : "var(--color-text)" }}>{valor}</div>
      <div className="mt-1 text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{sub}</div>}
    </div>
  );
}

"use client";

/**
 * Raio-X de Votos — explorador (client). Eleição+busca → ranking de candidatos
 * → detalhe do candidato com drill por município e, dentro do município, por
 * zona / bairro / local de votação / seção. Dados via server actions (RLS).
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Loader2, MapPin, Search, Trophy } from "lucide-react";

import type { EleicaoOpcao } from "@/app/actions/politico/intelEleitoral";
import { CandFoto } from "@/components/politico/cand-foto";
import {
  rankingCandidatos,
  resumoCandidato,
  drillCandidato,
  eleicaoTotal,
  type CandidatoRank,
  type ResumoCandidato,
  type DrillLinha,
} from "@/app/actions/politico/raioX";

type DimInterna = "zona" | "bairro" | "local" | "secao";
const DIMS: { key: DimInterna; label: string }[] = [
  { key: "bairro", label: "Bairro" },
  { key: "local", label: "Local" },
  { key: "zona", label: "Zona" },
  { key: "secao", label: "Seção" },
];

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(2)}%` : "—";
}
function ehEleito(s: string | null): boolean {
  return !!s && /eleito/i.test(s) && !/não/i.test(s);
}

export default function RaioXClient({ eleicoes }: { eleicoes: EleicaoOpcao[] }) {
  const [eleicaoId, setEleicaoId] = useState(eleicoes[0]!.id);
  const [q, setQ] = useState("");
  const [ranking, setRanking] = useState<CandidatoRank[]>([]);
  const [totalEleicao, setTotalEleicao] = useState(0);
  const [carregandoLista, iniciarLista] = useTransition();

  // detalhe
  const [cand, setCand] = useState<ResumoCandidato | null>(null);
  const [municipios, setMunicipios] = useState<DrillLinha[]>([]);
  const [munSel, setMunSel] = useState<DrillLinha | null>(null);
  const [dim, setDim] = useState<DimInterna>("bairro");
  const [drill, setDrill] = useState<DrillLinha[]>([]);
  const [carregandoDet, iniciarDet] = useTransition();

  const buscaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eleicaoAno = eleicoes.find((e) => e.id === eleicaoId)?.ano ?? 0;

  // carrega ranking + total ao trocar eleição ou busca (debounce)
  function recarregarLista(id: number, termo: string) {
    iniciarLista(async () => {
      const [r, t] = await Promise.all([rankingCandidatos(id, termo, 50), eleicaoTotal(id)]);
      setRanking(r);
      setTotalEleicao(t);
    });
  }
  useEffect(() => {
    recarregarLista(eleicaoId, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eleicaoId]);

  function onBusca(v: string) {
    setQ(v);
    if (buscaRef.current) clearTimeout(buscaRef.current);
    buscaRef.current = setTimeout(() => recarregarLista(eleicaoId, v.trim()), 350);
  }

  function abrirCandidato(sq: string) {
    iniciarDet(async () => {
      const [resumo, muns] = await Promise.all([
        resumoCandidato(eleicaoId, sq),
        drillCandidato(eleicaoId, sq, "municipio"),
      ]);
      setCand(resumo);
      setMunicipios(muns);
      setMunSel(null);
      setDrill([]);
    });
  }

  function abrirMunicipio(m: DrillLinha) {
    setMunSel(m);
    setDim("bairro");
    iniciarDet(async () => {
      setDrill(await drillCandidato(eleicaoId, cand!.sq, "bairro", Number(m.chave)));
    });
  }
  function trocarDim(d: DimInterna) {
    setDim(d);
    iniciarDet(async () => {
      setDrill(await drillCandidato(eleicaoId, cand!.sq, d, Number(munSel!.chave)));
    });
  }

  function voltar() {
    setCand(null);
    setMunicipios([]);
    setMunSel(null);
    setDrill([]);
  }

  const seletorEleicao = (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Eleição</span>
      <select value={eleicaoId} onChange={(e) => setEleicaoId(Number(e.target.value))} className="wr-input min-w-[240px]">
        {eleicoes.map((e) => (
          <option key={e.id} value={e.id}>{e.label}</option>
        ))}
      </select>
    </label>
  );

  // ---------- DETALHE ----------
  if (cand) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={voltar} className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao ranking
        </button>

        {/* Cabeçalho do candidato */}
        <header className="wr-card overflow-hidden p-0">
          <div className="p-6 sm:p-7" style={{ background: "linear-gradient(135deg,#0E1116 0%,#14181F 55%,#1A2410 100%)" }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <div style={{ border: "2px solid rgba(215,243,106,0.35)", borderRadius: "9999px" }}>
                  <CandFoto sq={cand.sq} ano={eleicaoAno} nome={cand.nomeUrna} size={64} />
                </div>
                <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#D7F36A" }}>
                    nº {cand.nr}{cand.partido ? ` · ${cand.partido}` : ""}
                  </span>
                  {cand.situacao && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={ehEleito(cand.situacao) ? { background: "rgba(34,197,94,0.2)", color: "#4ade80" } : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                      {cand.situacao}
                    </span>
                  )}
                </div>
                <h2 className="font-heading mt-1 text-2xl font-bold leading-tight" style={{ color: "#FFFFFF" }}>{cand.nomeUrna}</h2>
                <p className="mt-0.5 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{cand.nome}{cand.coligacao ? ` · ${cand.coligacao}` : ""}</p>
                </div>
              </div>
              <div className="flex gap-6">
                <div className="text-right">
                  <div className="font-heading text-3xl font-bold tabular-nums" style={{ color: "#D7F36A" }}>{cand.votos.toLocaleString("pt-BR")}</div>
                  <div className="text-[11px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>votos (total)</div>
                </div>
                <div className="text-right">
                  <div className="font-heading text-3xl font-bold tabular-nums" style={{ color: "#FFFFFF" }}>{pct(cand.votos, cand.totalEleicao)}</div>
                  <div className="text-[11px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>do cargo (MG)</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
          {/* Municípios */}
          <section className="wr-card flex flex-col p-0">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Municípios</h3>
              <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{municipios.length} com voto</span>
            </div>
            <ListaDrill linhas={municipios} selecionavel selecionado={munSel?.chave} onSelecionar={abrirMunicipio} />
          </section>

          {/* Drill dentro do município */}
          <section className="wr-card flex flex-col p-0">
            {munSel ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
                  <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
                    <MapPin className="mr-1 inline h-4 w-4" aria-hidden style={{ color: "#5C7F23" }} />{munSel.rotulo}
                  </h3>
                  {carregandoDet && <Loader2 className="h-4 w-4 animate-spin" aria-hidden style={{ color: "var(--color-text-subtle)" }} />}
                </div>
                <div className="flex gap-1 border-b px-4 pb-2" style={{ borderColor: "var(--color-border)" }}>
                  {DIMS.map((d) => (
                    <button key={d.key} type="button" onClick={() => trocarDim(d.key)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={dim === d.key ? { background: "#16181D", color: "#FFFFFF" } : { color: "var(--color-text-muted)" }}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <ListaDrill linhas={drill} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
                Selecione um município à esquerda para ver bairros, locais de votação, zonas e seções.
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ---------- RANKING ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {seletorEleicao}
        <label className="flex min-w-[260px] flex-1 flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Buscar candidato</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
            <input value={q} onChange={(e) => onBusca(e.target.value)} placeholder="Nome ou número do candidato" className="wr-input w-full pl-9" />
          </div>
        </label>
        {carregandoLista && <Loader2 className="mb-2 h-4 w-4 animate-spin" aria-hidden style={{ color: "var(--color-text-subtle)" }} />}
      </div>

      <section className="wr-card overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
            <Trophy className="mr-1 inline h-4 w-4" aria-hidden style={{ color: "#D7F36A" }} />
            {q ? "Resultados" : "Mais votados"}
          </h3>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>clique para o raio-x</span>
        </div>
        {ranking.length === 0 ? (
          <div className="p-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
            {carregandoLista ? "Carregando…" : "Nenhum candidato encontrado."}
          </div>
        ) : (
          <ul>
            {ranking.map((c) => (
              <li key={c.sq}>
                <button type="button" onClick={() => abrirCandidato(c.sq)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                  style={{ borderTop: "1px solid var(--color-border)" }}>
                  <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums" style={{ color: c.posicao <= 3 ? "#5C7F23" : "var(--color-text-subtle)" }}>{c.posicao}</span>
                  <CandFoto sq={c.sq} ano={eleicaoAno} nome={c.nomeUrna} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>{c.nomeUrna}</span>
                      {ehEleito(c.situacao) && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "#E2F5EC", color: "#17784F" }}>{c.situacao}</span>}
                    </div>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{c.nr}{c.partido ? ` · ${c.partido}` : ""}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{c.votos.toLocaleString("pt-BR")}</div>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{pct(c.votos, totalEleicao)}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ListaDrill({ linhas, selecionavel, selecionado, onSelecionar }: {
  linhas: DrillLinha[];
  selecionavel?: boolean;
  selecionado?: string;
  onSelecionar?: (l: DrillLinha) => void;
}) {
  const max = useMemo(() => Math.max(...linhas.map((l) => l.votos), 1), [linhas]);
  if (linhas.length === 0) {
    return <div className="p-8 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>Sem dados.</div>;
  }
  return (
    <ul className="max-h-[520px] overflow-y-auto">
      {linhas.map((l, i) => {
        const conteudo = (
          <>
            <span className="w-6 shrink-0 text-right text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>{l.rotulo}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{l.votos.toLocaleString("pt-BR")}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max((l.votos / max) * 100, 2)}%`, background: "#A9D13F" }} />
                </div>
                <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{pct(l.votos, l.universo)}</span>
              </div>
            </div>
          </>
        );
        return (
          <li key={l.chave + i} style={{ borderTop: i === 0 ? undefined : "1px solid var(--color-border)" }}>
            {selecionavel ? (
              <button type="button" onClick={() => onSelecionar?.(l)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                style={selecionado === l.chave ? { background: "rgba(215,243,106,0.12)" } : undefined}>
                {conteudo}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-5 py-2.5">{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

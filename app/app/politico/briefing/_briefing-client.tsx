"use client";

/**
 * Dossiê Estratégico (client). Eleição + município + busca de candidato →
 * "Gerar dossiê" → a IA cruza voto (TSE), redutos e base (CRM) e escreve o
 * briefing. Botão de impressão para levar à reunião/demo.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Search, X, Sparkles, Printer, FileText } from "lucide-react";

import type { EleicaoOpcao } from "@/app/actions/politico/intelEleitoral";
import { rankingCandidatos, type CandidatoRank, type MunicipioOpcao } from "@/app/actions/politico/raioX";
import { briefingEstrategico } from "@/app/actions/politico/briefing";
import { CandFoto } from "@/components/politico/cand-foto";
import { MiniMarkdown } from "@/components/politico/mini-markdown";

export default function BriefingClient({ eleicoes, municipios }: { eleicoes: EleicaoOpcao[]; municipios: MunicipioOpcao[] }) {
  const [eleicaoId, setEleicaoId] = useState(eleicoes[0]!.id);
  const [munTse, setMunTse] = useState("");
  const [cand, setCand] = useState<CandidatoRank | null>(null);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CandidatoRank[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, inicia] = useTransition();
  const [gerando, setGerando] = useState(false);
  const [dossie, setDossie] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const ano = eleicoes.find((e) => e.id === eleicaoId)?.ano ?? 0;
  const cargoAno = eleicoes.find((e) => e.id === eleicaoId)?.label ?? "";
  const munNome = municipios.find((m) => m.tse === munTse)?.nome ?? "";

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function limparSaida() { setDossie(null); setErro(null); }
  function buscar(termo: string) {
    setQ(termo);
    if (termo.trim().length < 2) { setResultados([]); setAberto(false); return; }
    setAberto(true);
    inicia(async () => setResultados(await rankingCandidatos(eleicaoId, termo.trim(), 30)));
  }
  function escolher(c: CandidatoRank) { setCand(c); setQ(""); setResultados([]); setAberto(false); limparSaida(); }

  async function gerar() {
    if (!cand || !munTse) return;
    setGerando(true); setDossie(null); setErro(null);
    try {
      const r = await briefingEstrategico(eleicaoId, cand.sq, munTse, munNome, cargoAno, ano);
      if (r.ok) setDossie(r.texto); else setErro(r.erro);
    } catch {
      setErro("Não consegui gerar agora. Tente novamente em instantes.");
    } finally {
      setGerando(false);
    }
  }

  const pronto = cand && munTse;

  return (
    <div className="space-y-4">
      {/* Seletores */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Eleição</span>
          <select value={eleicaoId} onChange={(e) => { setEleicaoId(Number(e.target.value)); setCand(null); limparSaida(); }} className="wr-input min-w-[200px]">
            {eleicoes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Município</span>
          <select value={munTse} onChange={(e) => { setMunTse(e.target.value); limparSaida(); }} className="wr-input min-w-[200px]">
            <option value="">Selecione…</option>
            {municipios.map((m) => <option key={m.tse} value={m.tse}>{m.nome}</option>)}
          </select>
        </label>
        <div className="relative min-w-[280px] flex-1" ref={boxRef}>
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Candidato</span>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden style={{ color: "var(--color-text-subtle)" }} />
            <input value={q} onChange={(e) => buscar(e.target.value)} onFocus={() => { if (resultados.length) setAberto(true); }}
              placeholder={cand ? `${cand.nomeUrna} — trocar…` : "Buscar por nome ou número"} className="wr-input w-full pl-9" />
            {q && <button type="button" onClick={() => { setQ(""); setResultados([]); setAberto(false); }} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="limpar"><X className="h-4 w-4" style={{ color: "var(--color-text-subtle)" }} /></button>}
          </div>
          {aberto && (
            <ul className="absolute z-30 mt-1 max-h-[340px] w-full overflow-y-auto rounded-xl py-1 shadow-xl" style={{ background: "#1a1d24", border: "1px solid rgba(255,255,255,0.12)" }}>
              {resultados.map((c) => (
                <li key={c.sq}>
                  <button type="button" onClick={() => escolher(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[rgba(255,255,255,0.06)]">
                    <CandFoto sq={c.sq} ano={ano} nome={c.nomeUrna} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: "#fff" }}>{c.nomeUrna}</div>
                      <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{c.nr}{c.partido ? ` · ${c.partido}` : ""} · {c.votos.toLocaleString("pt-BR")} votos</div>
                    </div>
                  </button>
                </li>
              ))}
              {resultados.length === 0 && <li className="px-3 py-4 text-center text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{buscando ? "Buscando…" : "Nenhum candidato."}</li>}
            </ul>
          )}
        </div>
      </div>

      {/* Candidato escolhido + ação */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center gap-3">
          {cand ? <CandFoto sq={cand.sq} ano={ano} nome={cand.nomeUrna} size={40} /> : <FileText className="h-6 w-6" aria-hidden style={{ color: "rgba(255,255,255,0.4)" }} />}
          <div className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
            {cand ? <><strong style={{ color: "#fff" }}>{cand.nomeUrna}</strong>{munNome ? <> em <strong style={{ color: "#fff" }}>{munNome}</strong></> : " — escolha o município"}</> : "Escolha candidato e município para gerar o dossiê."}
          </div>
        </div>
        <button type="button" onClick={gerar} disabled={!pronto || gerando}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: "#D7F36A", color: "#16181D" }}>
          {gerando ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Gerando dossiê…</> : <><Sparkles className="h-4 w-4" aria-hidden /> {dossie ? "Refazer dossiê" : "Gerar dossiê"}</>}
        </button>
      </div>

      {erro && <div className="wr-card p-4 text-sm" style={{ color: "#E08079" }}>{erro}</div>}

      {dossie && (
        <section className="wr-card p-6" id="dossie-impressao">
          <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" aria-hidden style={{ color: "#D7F36A" }} />
              <h2 className="font-heading text-lg font-bold" style={{ color: "var(--color-text)" }}>
                Dossiê — {cand?.nomeUrna} · {munNome}
              </h2>
            </div>
            <button type="button" onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
              <Printer className="h-3.5 w-3.5" aria-hidden /> Imprimir
            </button>
          </div>
          <MiniMarkdown texto={dossie} />
          <p className="mt-4 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
            Gerado por IA a partir de dados reais do TSE e da sua base (CRM). Documento de apoio — confira antes de decidir.
          </p>
        </section>
      )}
    </div>
  );
}

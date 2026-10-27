"use client";

/**
 * Narrativas Territoriais por IA (Pilar 3). Escolhe município + bairro, a IA
 * cruza voto (TSE) × base CRM × demandas × lideranças × a batalha local e escreve
 * a narrativa estratégica do território, com riscos, oportunidades e ações.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, MapPin, AlertTriangle, TrendingUp, ListChecks, Clock, RefreshCw } from "lucide-react";

import { MiniMarkdown } from "@/components/politico/mini-markdown";
import { recortesMunicipio, type MunicipioOpcao } from "@/app/actions/politico/raioX";
import { gerarNarrativa, obterNarrativaRecente, obterNarrativaPorId, type NarrativaTerritorial } from "@/app/actions/politico/narrativa";

interface HistItem {
  id: string;
  bairro: string;
  regional: string | null;
  municipioNome: string;
  geradoEm: string;
}

interface Props {
  temMandato: boolean;
  mandatoNome: string | null;
  electionId: number;
  municipios: MunicipioOpcao[];
  historico: HistItem[];
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NarrativasClient({ temMandato, mandatoNome, electionId, municipios, historico }: Props) {
  const [municipioTse, setMunicipioTse] = useState("");
  const [municipioNome, setMunicipioNome] = useState("");
  const [bairros, setBairros] = useState<string[]>([]);
  const [bairro, setBairro] = useState("");
  const [narrativa, setNarrativa] = useState<NarrativaTerritorial | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [hist, setHist] = useState<HistItem[]>(historico);
  const [carregandoBairros, startBairros] = useTransition();
  const [gerando, startGerar] = useTransition();
  const [abrindo, startAbrir] = useTransition();

  function escolherMunicipio(tse: string) {
    setMunicipioTse(tse);
    setMunicipioNome(municipios.find((m) => m.tse === tse)?.nome ?? "");
    setBairro("");
    setBairros([]);
    setNarrativa(null);
    setErro(null);
    if (!tse) return;
    startBairros(async () => {
      const r = await recortesMunicipio(electionId, tse);
      setBairros(r.bairros);
    });
  }

  function escolherBairro(b: string) {
    setBairro(b);
    setNarrativa(null);
    setErro(null);
    if (!b || !municipioTse) return;
    // Mostra a última narrativa salva deste bairro, se houver (cache).
    startAbrir(async () => {
      const recente = await obterNarrativaRecente(Number(municipioTse), b);
      if (recente) setNarrativa(recente);
    });
  }

  function gerar() {
    if (!municipioTse || !bairro) return;
    setErro(null);
    startGerar(async () => {
      const res = await gerarNarrativa(Number(municipioTse), municipioNome, bairro);
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      setNarrativa(res.narrativa);
      // Atualiza o histórico no topo.
      setHist((h) => [
        { id: res.narrativa.id, bairro: res.narrativa.bairro, regional: res.narrativa.regional, municipioNome: res.narrativa.municipioNome, geradoEm: res.narrativa.geradoEm },
        ...h.filter((x) => x.id !== res.narrativa.id),
      ].slice(0, 20));
    });
  }

  function abrirDoHistorico(id: string) {
    if (!id) return;
    setErro(null);
    startAbrir(async () => {
      const n = await obterNarrativaPorId(id);
      if (n) {
        setNarrativa(n);
        setMunicipioNome(n.municipioNome);
      }
    });
  }

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-7 space-y-5">
      {/* Cabeçalho */}
      <header>
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.16)", color: "#7E8F2B" }} aria-hidden>
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-heading text-[26px] font-bold leading-tight" style={{ color: "var(--color-text)" }}>Narrativas Territoriais</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>A IA lê um bairro inteiro — voto, sua base, demandas, lideranças e a disputa — e escreve a estratégia do território.</p>
          </div>
        </div>
      </header>

      {!temMandato ? (
        <div className="wr-card p-6 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Para gerar narrativas, primeiro vincule o seu candidato do TSE em{" "}
          <Link href="/app/politico/obras" className="font-semibold" style={{ color: "#4352C4" }}>Obras › Meu mandato</Link>. É daí que vem o voto do seu território.
        </div>
      ) : (
        <>
          {/* Seletores */}
          <section className="wr-card p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Município</span>
                <select value={municipioTse} onChange={(e) => escolherMunicipio(e.target.value)} className="wr-input w-full">
                  <option value="">Escolha…</option>
                  {municipios.map((m) => <option key={m.tse} value={m.tse}>{m.nome}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Bairro</span>
                <select value={bairro} onChange={(e) => escolherBairro(e.target.value)} disabled={!municipioTse || carregandoBairros} className="wr-input w-full">
                  <option value="">{carregandoBairros ? "Carregando…" : !municipioTse ? "Escolha o município" : bairros.length === 0 ? "Sem bairros" : "Escolha…"}</option>
                  {bairros.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={gerar}
                disabled={!bairro || gerando}
                className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ background: "#D7F36A", color: "#16181D" }}
              >
                <Sparkles className="h-4 w-4" aria-hidden /> {gerando ? "Gerando…" : narrativa ? "Regenerar" : "Gerar narrativa"}
              </button>
            </div>
            {mandatoNome && <p className="mt-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>Mandato: <strong style={{ color: "var(--color-text-muted)" }}>{mandatoNome}</strong> · o voto do território vem dele (TSE); a base vem do seu CRM.</p>}
          </section>

          {erro && <div className="wr-card p-4 text-sm" style={{ color: "#E08079" }}>{erro}</div>}

          {(gerando || abrindo) && !narrativa && (
            <div className="wr-card p-6 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>Lendo o território e escrevendo a narrativa…</div>
          )}

          {/* Narrativa */}
          {narrativa && (
            <section className="wr-card p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#7E8F2B" }}>
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> {narrativa.regional ? `Regional ${narrativa.regional}` : narrativa.municipioNome}
                  </div>
                  <h2 className="mt-0.5 font-heading text-2xl font-bold" style={{ color: "var(--color-text)" }}>{narrativa.bairro}</h2>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                    <Clock className="h-3 w-3" aria-hidden /> {fmtData(narrativa.geradoEm)}
                  </div>
                </div>
                <button type="button" onClick={gerar} disabled={gerando} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Regenerar
                </button>
              </div>

              {/* Fontes (o retrato de dados do bairro) */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Fonte valor={narrativa.fontes.meusVotos.toLocaleString("pt-BR")} label="seus votos no bairro" sub={narrativa.fontes.universo > 0 ? `${((narrativa.fontes.meusVotos / narrativa.fontes.universo) * 100).toFixed(1)}% do bairro` : "—"} accent="#D7F36A" />
                <Fonte valor={narrativa.fontes.leads.toLocaleString("pt-BR")} label="sua base de contatos" sub={`${narrativa.fontes.quentes}q · ${narrativa.fontes.mornos}m · ${narrativa.fontes.frios}f`} />
                <Fonte valor={String(narrativa.fontes.demAbertas)} label="demandas abertas" sub={`${narrativa.fontes.demResolvidas} resolvidas`} />
                <Fonte valor={String(narrativa.fontes.liderancas)} label="lideranças aqui" sub={narrativa.fontes.adversarios[0] ? `rival: ${narrativa.fontes.adversarios[0].nome}` : "—"} />
              </div>

              {/* Texto da narrativa */}
              <div className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
                <MiniMarkdown texto={narrativa.texto} />
              </div>

              {/* Riscos / Oportunidades / Ações */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Bloco titulo="Riscos" icone={<AlertTriangle className="h-4 w-4" aria-hidden />} cor="#A3302A" itens={narrativa.riscos} />
                <Bloco titulo="Oportunidades" icone={<TrendingUp className="h-4 w-4" aria-hidden />} cor="#17784F" itens={narrativa.oportunidades} />
                <Bloco titulo="Ações recomendadas" icone={<ListChecks className="h-4 w-4" aria-hidden />} cor="#4352C4" itens={narrativa.acoes} />
              </div>

              <p className="border-t pt-3 text-[11px]" style={{ borderColor: "var(--color-border)", color: "var(--color-text-subtle)" }}>
                Fonte: TSE (voto) · CRM da operação (base, demandas, lideranças). A IA usa apenas estes números — não inventa dados.
              </p>
            </section>
          )}

          {/* Histórico */}
          {hist.length > 0 && (
            <section className="wr-card p-5">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[.08em]" style={{ color: "var(--color-text-subtle)" }}>Narrativas recentes</h3>
              <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {hist.map((h) => (
                  <li key={h.id || `${h.bairro}-${h.geradoEm}`}>
                    <button type="button" onClick={() => abrirDoHistorico(h.id)} disabled={!h.id || abrindo} className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-opacity hover:opacity-70 disabled:opacity-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>{h.bairro}</span>
                        <span className="block text-xs" style={{ color: "var(--color-text-subtle)" }}>{h.regional ? `Regional ${h.regional} · ` : ""}{h.municipioNome}</span>
                      </span>
                      <span className="shrink-0 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{fmtData(h.geradoEm)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Fonte({ valor, label, sub, accent }: { valor: string; label: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
      <div className="font-heading text-lg font-bold tabular-nums leading-none" style={{ color: accent ?? "var(--color-text)" }}>{valor}</div>
      <div className="mt-1 text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      {sub && <div className="text-[10px]" style={{ color: "var(--color-text-subtle)" }}>{sub}</div>}
    </div>
  );
}

function Bloco({ titulo, icone, cor, itens }: { titulo: string; icone: React.ReactNode; cor: string; itens: string[] }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: cor }}>{icone}{titulo}</div>
      {itens.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>—</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.map((t, i) => (
            <li key={i} className="flex gap-1.5 text-xs leading-snug" style={{ color: "var(--color-text-muted)" }}>
              <span style={{ color: cor }} aria-hidden>•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

/**
 * "Onde está sua base" — ranking de CIDADES (quantos cadastros em cada) com
 * drill-down de BAIRROS sob demanda. Substitui o mapa de calor (o cliente achou
 * o mapa confuso; a lista responde direto "qual cidade/bairro tem mais gente").
 *
 * EXATO: cidades vêm do agregado por IBGE (pol_mapa_base_municipios); bairros são
 * puxados SÓ ao expandir uma cidade e SÓ os que têm cadastro (nunca pré-populados).
 */

import { useState } from "react";
import { Building2, ChevronDown, MapPin } from "lucide-react";

import { bairrosDaCidade, type BairroRow } from "@/app/actions/politico/territorio-actions";

export interface CidadePonto {
  ibge: string;
  nome: string;
  total: number;
}

export interface BaseTerritorioResumo {
  pontos: CidadePonto[];
  mapeados: number;
  cidades: number;
  cidadeTop: string;
  naoLocalizados: number;
}

/** Bairros chegam em CAIXA ALTA da base ("ALÍPIO DE MELO") — suaviza pra exibir. */
function titulo(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bDe\b|\bDa\b|\bDo\b|\bDos\b|\bDas\b/g, (w) => w.toLowerCase());
}

export default function BaseTerritorioHero({ resumo }: { resumo: BaseTerritorioResumo }) {
  const [aberto, setAberto] = useState(true);
  const [verTodas, setVerTodas] = useState(false);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [bairros, setBairros] = useState<Record<string, BairroRow[] | "loading">>({});

  if (resumo.pontos.length === 0) return null;

  const maxTotal = resumo.pontos[0]?.total ?? 1;
  const lista = verTodas ? resumo.pontos : resumo.pontos.slice(0, 12);

  async function alternarCidade(nome: string) {
    if (expandida === nome) {
      setExpandida(null);
      return;
    }
    setExpandida(nome);
    if (!bairros[nome]) {
      setBairros((b) => ({ ...b, [nome]: "loading" }));
      const r = await bairrosDaCidade(nome);
      setBairros((b) => ({ ...b, [nome]: r }));
    }
  }

  return (
    <section className="wr-card overflow-hidden p-0">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(215,243,106,0.12)" }}>
          <MapPin className="h-4 w-4" style={{ color: "#D7F36A" }} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
            Onde está sua base
          </span>
          <span className="block truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
            {resumo.mapeados.toLocaleString("pt-BR")} cadastros em {resumo.cidades.toLocaleString("pt-BR")} cidades
            {resumo.cidadeTop ? ` · ${resumo.cidadeTop} lidera` : ""}
            {resumo.naoLocalizados > 0 ? ` · ${resumo.naoLocalizados.toLocaleString("pt-BR")} sem cidade reconhecida` : ""}
          </span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 transition-transform" style={{ color: "var(--color-text-subtle)", transform: aberto ? "rotate(180deg)" : "none" }} aria-hidden />
      </button>

      {aberto && (
        <div className="px-3 pb-4 sm:px-4">
          <p className="mb-2 px-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Clique numa cidade para ver os bairros com mais cadastros.
          </p>
          <ol className="space-y-1">
            {lista.map((c, i) => {
              const pct = resumo.mapeados > 0 ? (c.total / resumo.mapeados) * 100 : 0;
              const larguraBarra = maxTotal > 0 ? Math.max((c.total / maxTotal) * 100, 2) : 0;
              const estaAberta = expandida === c.nome;
              const bs = bairros[c.nome];
              return (
                <li key={c.ibge} className="rounded-xl" style={{ background: estaAberta ? "var(--color-surface)" : "transparent" }}>
                  <button type="button" onClick={() => alternarCidade(c.nome)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface)]">
                    <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums" style={{ color: i < 3 ? "#D7F36A" : "var(--color-text-subtle)" }}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>{c.nome}</span>
                        <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                          {c.total.toLocaleString("pt-BR")}
                          <span className="ml-1.5 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>{pct.toFixed(pct >= 10 ? 0 : 1)}%</span>
                        </span>
                      </span>
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <span className="block h-full rounded-full" style={{ width: `${larguraBarra}%`, background: "linear-gradient(90deg,#4352C4,#D7F36A)" }} />
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform" style={{ color: "var(--color-text-subtle)", transform: estaAberta ? "rotate(180deg)" : "none" }} aria-hidden />
                  </button>

                  {estaAberta && (
                    <div className="px-3 pb-3 pl-10">
                      {bs === "loading" || bs === undefined ? (
                        <p className="py-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>Carregando bairros…</p>
                      ) : bs.length === 0 ? (
                        <p className="py-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                          Nenhum bairro informado nesta cidade ainda — aparecem conforme os cadastros trazem o bairro.
                        </p>
                      ) : (
                        <ul className="space-y-0.5">
                          <li className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
                            <Building2 className="h-3 w-3" aria-hidden /> Bairros com mais cadastros
                          </li>
                          {bs.map((b) => (
                            <li key={b.nome} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate" style={{ color: "var(--color-text-muted)" }}>{titulo(b.nome)}</span>
                              <span className="shrink-0 font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{b.total.toLocaleString("pt-BR")}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {resumo.pontos.length > 12 && (
            <button type="button" onClick={() => setVerTodas((v) => !v)} className="mt-2 w-full rounded-lg py-2 text-center text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface)" }}>
              {verTodas ? "Ver menos" : `Ver todas as ${resumo.cidades.toLocaleString("pt-BR")} cidades`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

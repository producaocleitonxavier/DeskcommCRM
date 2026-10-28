"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, FileText, Loader2 } from "lucide-react";
import { buscarOficios, type OficioItem } from "@/app/actions/politico/oficios";
import { CommandHero } from "@/components/politico/command-hero";

export default function OficiosClient({
  inicial,
  temMaisInicial,
}: {
  inicial: OficioItem[];
  temMaisInicial: boolean;
}) {
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<OficioItem[]>(inicial);
  const [temMais, setTemMais] = useState(temMaisInicial);
  const [pagina, setPagina] = useState(0);
  const [pending, start] = useTransition();
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buscar(t: string, p: number, append: boolean) {
    start(async () => {
      const r = await buscarOficios(t, p);
      setItens((prev) => (append ? [...prev, ...r.itens] : r.itens));
      setTemMais(r.temMais);
      setPagina(p);
    });
  }

  function onTermo(v: string) {
    setTermo(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => buscar(v, 0, false), 350);
  }

  const fmtData = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-[860px] space-y-5 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Gabinete"
        titulo="Ofícios"
        subtitulo="Busque qualquer ofício por número, assunto, órgão ou nome do cidadão."
        acoes={[{ href: "/app/politico/demandas", label: "← Gabinete" }]}
      />

      {/* Busca */}
      <div
        className="flex items-center gap-2.5 rounded-full px-4"
        style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", minHeight: 48 }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
        <input
          value={termo}
          onChange={(e) => onTermo(e.target.value)}
          placeholder="Ex.: 405/2026, poda de árvore, João, Secretaria de Obras…"
          className="w-full bg-transparent py-3 text-sm outline-none"
          style={{ color: "var(--color-text)" }}
        />
        {pending && <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: "var(--color-text-subtle)" }} aria-hidden />}
      </div>

      {/* Lista */}
      {itens.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--color-text-subtle)" }}>
          {termo ? "Nenhum ofício encontrado para essa busca." : "Nenhum ofício emitido ainda."}
        </p>
      ) : (
        <ul className="space-y-2">
          {itens.map((o) => (
            <li key={o.demandaId}>
              <Link
                href={`/app/politico/demandas/${o.demandaId}`}
                className="flex items-start gap-3 rounded-xl p-4 transition-colors hover:bg-[var(--color-surface-elevated)]"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(215,243,106,0.12)", color: "#D7F36A" }} aria-hidden>
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold" style={{ color: "var(--color-text)" }}>{o.rotulo}</span>
                    <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>· {fmtData(o.emitidoEm)}</span>
                  </div>
                  {o.assunto && (
                    <div className="truncate text-sm" style={{ color: "var(--color-text-muted)" }}>{o.assunto}</div>
                  )}
                  <div className="mt-0.5 truncate text-xs" style={{ color: "var(--color-text-subtle)" }}>
                    {o.cidadaoNome ?? "—"}
                    {o.orgao ? ` · ${o.orgao}` : ""}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {temMais && (
        <div className="text-center">
          <button type="button" disabled={pending} onClick={() => buscar(termo, pagina + 1, true)} className="wr-btn disabled:opacity-60">
            {pending ? "Carregando…" : "Ver mais"}
          </button>
        </div>
      )}
    </div>
  );
}

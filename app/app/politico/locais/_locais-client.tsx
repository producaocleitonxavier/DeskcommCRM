"use client";

/**
 * Locais & Eventos (War Room 2.0, Fase 2) — a estante de locais (escolas, igrejas,
 * associações...) onde o mandato faz eventos. Cada card é um Local que agrupa os
 * eventos e os cadastros feitos ali. Filtro por tipo, KPIs, grade de cards.
 * Design System: wr-card + tokens.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Users,
  CalendarCheck,
  GraduationCap,
  Church,
  Building2,
  Users2,
  Landmark,
  PartyPopper,
  Trees,
  Store,
  Tag,
  Layers,
} from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";

const TIPO: Record<string, { label: string; icon: typeof MapPin }> = {
  escola: { label: "Escola", icon: GraduationCap },
  igreja: { label: "Igreja", icon: Church },
  associacao: { label: "Associação", icon: Users2 },
  rua_de_lazer: { label: "Rua de Lazer", icon: PartyPopper },
  praca: { label: "Praça", icon: Trees },
  feira: { label: "Feira", icon: Store },
  comunidade: { label: "Comunidade", icon: Users2 },
  empresa: { label: "Empresa", icon: Building2 },
  sindicato: { label: "Sindicato", icon: Landmark },
  ong: { label: "ONG", icon: Landmark },
  outro: { label: "Local", icon: MapPin },
};

export interface LocalItem {
  id: string;
  nome: string;
  tipo: string;
  bairro: string | null;
  cidade: string | null;
  zona: string | null;
  ativo: boolean;
  nEventos: number;
  nPessoas: number;
}

export interface LocaisClientProps {
  locais: LocalItem[];
  kpis: { locais: number; eventos: number; pessoas: number };
}

export default function LocaisClient({ locais, kpis }: LocaisClientProps) {
  const [filtro, setFiltro] = useState<string>("Todos");

  const tipos = useMemo(() => {
    const set = new Set<string>();
    for (const l of locais) set.add(l.tipo);
    return [...set].sort((a, b) => (TIPO[a]?.label ?? a).localeCompare(TIPO[b]?.label ?? b, "pt-BR"));
  }, [locais]);

  const visiveis = useMemo(
    () => (filtro === "Todos" ? locais : locais.filter((l) => l.tipo === filtro)),
    [locais, filtro],
  );

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Gabinete · Eventos"
        titulo="Locais & Eventos"
        subtitulo="Escolas, igrejas e associações onde o mandato faz eventos — cada local agrupa os cadastros e vira público quente."
        acoes={[
          { href: "/app/politico/locais/inteligencia", label: "📊 Inteligência" },
          { href: "/app/politico/locais/novo", label: "+ Novo local", primary: true },
        ]}
      />

      <section className="grid grid-cols-3 gap-4">
        <KpiCard label="Locais" valor={kpis.locais} icone={MapPin} />
        <KpiCard label="Eventos" valor={kpis.eventos} icone={CalendarCheck} />
        <KpiCard label="Pessoas cadastradas" valor={kpis.pessoas} icone={Users} />
      </section>

      {locais.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Nenhum local cadastrado"
          description="Comece cadastrando a primeira escola, igreja ou associação onde o mandato faz eventos. Depois é só registrar as pessoas ali dentro."
          action={{ label: "+ Novo local", href: "/app/politico/locais/novo" }}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {["Todos", ...tipos].map((t) => {
              const ativo = filtro === t;
              const label = t === "Todos" ? "Todos" : (TIPO[t]?.label ?? t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFiltro(t)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                  style={
                    ativo
                      ? { background: "#D7F36A", color: "#14181F" }
                      : {
                          background: "var(--color-surface-elevated)",
                          color: "var(--color-text-muted)",
                          border: "1px solid var(--color-border)",
                        }
                  }
                >
                  {t === "Todos" ? <Layers className="h-3.5 w-3.5" aria-hidden /> : <Tag className="h-3.5 w-3.5" aria-hidden />}
                  {label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((l) => {
              const tipo = TIPO[l.tipo] ?? TIPO.outro!;
              const Icone = tipo.icon;
              return (
                <Link
                  key={l.id}
                  href={`/app/politico/locais/${l.id}`}
                  className="wr-card flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-md"
                  style={{ opacity: l.ativo ? 1 : 0.6 }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: "rgba(215,243,106,0.12)", border: "1px solid rgba(215,243,106,0.22)" }}
                    >
                      <Icone className="h-5 w-5" style={{ color: "var(--color-accent)" }} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-subtle)" }}>
                        {tipo.label}
                      </div>
                      <h3 className="mt-0.5 font-semibold leading-snug">{l.nome}</h3>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {(l.bairro || l.cidade) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {[l.bairro, l.cidade].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {l.zona && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(215,243,106,0.16)", color: "#5B6B16" }}>
                        Zona {l.zona}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center gap-4 border-t pt-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
                    <span className="inline-flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
                      <CalendarCheck className="h-4 w-4" aria-hidden /> {l.nEventos} evento{l.nEventos === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--color-text)" }}>
                      <Users className="h-4 w-4" aria-hidden /> {l.nPessoas} pessoa{l.nPessoas === 1 ? "" : "s"}
                    </span>
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

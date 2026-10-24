"use client";

/**
 * Biblioteca de Materiais (War Room 2.0) — a estante de conteúdos do mandato:
 * e-books, PDFs, vídeos e links, com capa, categoria e descrição. KPIs no topo,
 * filtro por categoria (as "abas") e grade de cards com capa. Clicar na capa
 * abre o material; "Editar" vai para a ficha. Design System: wr-card + tokens.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Layers, PencilLine, ExternalLink, FileText, Film, Headphones, LinkIcon, Image as ImageIcon, CheckCircle2, Tag } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";

const TIPO: Record<string, { label: string; icon: typeof BookOpen }> = {
  ebook: { label: "E-book", icon: BookOpen },
  pdf: { label: "PDF", icon: FileText },
  video: { label: "Vídeo", icon: Film },
  audio: { label: "Áudio", icon: Headphones },
  link: { label: "Link", icon: LinkIcon },
  imagem: { label: "Imagem", icon: ImageIcon },
  outro: { label: "Material", icon: FileText },
};

export interface MaterialItem {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  tipo: string;
  url: string;
  capaUrl: string | null;
  ativo: boolean;
}

export interface MateriaisClientProps {
  materiais: MaterialItem[];
}

const SEM_CATEGORIA = "Sem categoria";

export default function MateriaisClient({ materiais }: MateriaisClientProps) {
  const [filtro, setFiltro] = useState<string>("Todos");

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const m of materiais) set.add(m.categoria?.trim() || SEM_CATEGORIA);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [materiais]);

  const visiveis = useMemo(() => {
    if (filtro === "Todos") return materiais;
    return materiais.filter((m) => (m.categoria?.trim() || SEM_CATEGORIA) === filtro);
  }, [materiais, filtro]);

  const kpis = {
    total: materiais.length,
    ativos: materiais.filter((m) => m.ativo).length,
    categorias: categorias.length,
  };

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Gabinete · Biblioteca"
        titulo="Biblioteca de Materiais"
        subtitulo="E-books, PDFs e conteúdos do mandato — organizados por tema, prontos para enviar e construir relacionamento."
        acoes={[{ href: "/app/politico/materiais/novo", label: "+ Novo material", primary: true }]}
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard label="Materiais" valor={kpis.total} icone={BookOpen} />
        <KpiCard label="Ativos" valor={kpis.ativos} icone={CheckCircle2} />
        <KpiCard label="Categorias" valor={kpis.categorias} icone={Layers} />
      </section>

      {materiais.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhum material cadastrado"
          description="Comece o seu banco de conteúdos: cadastre o primeiro e-book ou material, dê uma capa e um tema. Depois você vai enchendo a estante."
          action={{ label: "+ Novo material", href: "/app/politico/materiais/novo" }}
        />
      ) : (
        <>
          {/* Filtro por categoria — as "abas" */}
          <div className="flex flex-wrap gap-2">
            {["Todos", ...categorias].map((c) => {
              const ativo = filtro === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFiltro(c)}
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
                  {c === "Todos" ? <Layers className="h-3.5 w-3.5" aria-hidden /> : <Tag className="h-3.5 w-3.5" aria-hidden />}
                  {c}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((m) => {
              const tipo = TIPO[m.tipo] ?? TIPO.outro!;
              const Icone = tipo.icon;
              return (
                <div
                  key={m.id}
                  className="wr-card flex flex-col overflow-hidden p-0 transition-shadow duration-200 hover:shadow-md"
                  style={{ opacity: m.ativo ? 1 : 0.6 }}
                >
                  {/* Capa */}
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="group relative block">
                    <div className="relative aspect-[3/4] w-full overflow-hidden" style={{ background: "linear-gradient(135deg,#14181F 0%,#1A2410 100%)" }}>
                      {m.capaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.capaUrl}
                          alt={m.titulo}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
                          <span
                            className="flex h-14 w-14 items-center justify-center rounded-full"
                            style={{ background: "rgba(215,243,106,0.12)", border: "1px solid rgba(215,243,106,0.25)" }}
                          >
                            <Icone className="h-6 w-6" style={{ color: "#D7F36A" }} aria-hidden />
                          </span>
                          <span className="line-clamp-3 text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                            {m.titulo}
                          </span>
                        </div>
                      )}
                      {!m.ativo && (
                        <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#F0F0EB", color: "#5B606B" }}>
                          Inativo
                        </span>
                      )}
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(20,24,31,0.72)", color: "rgba(255,255,255,0.92)" }}>
                        <Icone className="h-3 w-3" aria-hidden /> {tipo.label}
                      </span>
                    </div>
                  </a>

                  {/* Corpo */}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    {m.categoria?.trim() && (
                      <span className="w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(215,243,106,0.16)", color: "#5B6B16" }}>
                        {m.categoria}
                      </span>
                    )}
                    <h3 className="font-semibold leading-snug">{m.titulo}</h3>
                    {m.descricao?.trim() && (
                      <p className="line-clamp-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {m.descricao}
                      </p>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center justify-between border-t px-4 py-2.5 text-sm" style={{ borderColor: "var(--color-border)" }}>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold"
                      style={{ color: "var(--color-text)" }}
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
                    </a>
                    <Link
                      href={`/app/politico/materiais/${m.id}`}
                      className="inline-flex items-center gap-1.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <PencilLine className="h-4 w-4" aria-hidden /> Editar
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * CommandHero — cabeçalho "Centro de Comando" (dark tactical + acento lime)
 * reutilizável nas telas do módulo político, no mesmo espírito da tela Hoje.
 * Componente apresentacional (sem estado): serve a server e client components.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export interface CommandHeroAcao {
  href: string;
  label: string;
  /** Botão de destaque (lime sólido). Os demais são contorno. */
  primary?: boolean;
}

export interface CommandHeroProps {
  /** Linha pequena em maiúsculas, ex.: "Gabinete · Lideranças". */
  eyebrow: string;
  titulo: string;
  subtitulo?: string;
  acoes?: CommandHeroAcao[];
  /** Conteúdo livre no canto direito (badges, contadores) — não é link. */
  extra?: ReactNode;
}

export function CommandHero({ eyebrow, titulo, subtitulo, acoes = [], extra }: CommandHeroProps) {
  return (
    <header
      className="wr-card relative overflow-hidden p-6 sm:p-7"
      style={{
        background: "var(--hero-grad)",
        border: "1px solid var(--hero-border)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(closest-side,var(--hero-glow),transparent)" }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--hero-eyebrow)" }}>
            {eyebrow}
          </span>
          <h1 className="font-heading mt-1.5 text-3xl font-bold leading-tight" style={{ color: "var(--hero-title)" }}>
            {titulo}
          </h1>
          {subtitulo ? (
            <p className="mt-1.5 max-w-2xl text-sm" style={{ color: "var(--hero-sub)" }}>
              {subtitulo}
            </p>
          ) : null}
        </div>
        {(acoes.length > 0 || extra) && (
          <div className="flex flex-wrap items-center gap-2">
            {extra}
            {acoes.map((a) =>
              a.primary ? (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-semibold"
                  style={{ background: "var(--hero-btn-bg)", color: "var(--hero-btn-fg)" }}
                >
                  {a.label}
                </Link>
              ) : (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-medium transition-colors"
                  style={{ border: "1px solid var(--hero-btn-outline)", color: "var(--hero-btn-outline-fg)" }}
                >
                  {a.label}
                </Link>
              ),
            )}
          </div>
        )}
      </div>
    </header>
  );
}

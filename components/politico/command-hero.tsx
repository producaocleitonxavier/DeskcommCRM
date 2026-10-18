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
        background: "linear-gradient(135deg,#0E1116 0%,#14181F 55%,#1A2410 100%)",
        border: "1px solid rgba(215,243,106,0.22)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(closest-side,rgba(215,243,106,0.16),transparent)" }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#D7F36A" }}>
            {eyebrow}
          </span>
          <h1 className="font-heading mt-1.5 text-3xl font-bold leading-tight" style={{ color: "#FFFFFF" }}>
            {titulo}
          </h1>
          {subtitulo ? (
            <p className="mt-1.5 max-w-2xl text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
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
                  style={{ background: "#D7F36A", color: "#14181F" }}
                >
                  {a.label}
                </Link>
              ) : (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-medium transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)" }}
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

"use client";

/**
 * KPI card — número grande + label + ícone + variação opcional.
 * Design System War Room 2.0 (globals.css): wr-card, tokens accent, font-heading.
 */

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  /** Número (formatado pt-BR) ou texto curto (ex.: nome de cidade). */
  valor: number | string;
  icone: LucideIcon;
  /** Variação percentual: positivo = seta verde pra cima, negativo = vermelha pra baixo. */
  variacao?: number;
  /** Cor opcional do número (default: cor de texto padrão). */
  cor?: string;
  /** Sufixo pequeno após o número (ex.: "%", "dias"). */
  sufixo?: string;
  /**
   * "dark" = card com gradiente azul escuro e texto branco (para destacar um KPI,
   * ex.: Votos Certos). "default" = card branco padrão.
   */
  variant?: "default" | "dark";
  className?: string;
}

export function KpiCard({ label, valor, icone: Icone, variacao, cor, sufixo, variant = "default", className }: KpiCardProps) {
  const temVariacao = typeof variacao === "number" && Number.isFinite(variacao);
  const subiu = (variacao ?? 0) >= 0;
  const escuro = variant === "dark";

  return (
    <div className={cn(escuro ? "wr-card-accent" : "wr-card-dark", "p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn("wr-kpi-value text-3xl leading-none")}
            style={cor ? { color: cor, textShadow: "none" } : undefined}
          >
            {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
            {sufixo && <span className="ml-0.5 text-lg font-semibold">{sufixo}</span>}
          </div>
          <div className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {label}
          </div>

          {temVariacao && (
            <span
              className="mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={
                subiu
                  ? { background: "rgba(34,197,94,0.15)", color: "#4ADE80" }
                  : { background: "rgba(239,68,68,0.15)", color: "#F87171" }
              }
            >
              {subiu ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
              {Math.abs(variacao as number).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>

        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(215,243,106,0.1)" }}
          aria-hidden
        >
          <Icone className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        </span>
      </div>
    </div>
  );
}

export default KpiCard;

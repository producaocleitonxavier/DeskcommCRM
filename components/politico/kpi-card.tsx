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
  valor: number;
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
    <div
      className={cn("wr-card p-6", className)}
      style={escuro ? { background: "linear-gradient(135deg, #4352C4 0%, #26318F 100%)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="font-heading text-3xl font-bold tabular-nums leading-none"
            style={{ color: cor ?? (escuro ? "#FFFFFF" : undefined) }}
          >
            {valor.toLocaleString("pt-BR")}
            {sufixo && <span className="ml-0.5 text-lg font-semibold">{sufixo}</span>}
          </div>
          <div
            className={cn("mt-2 text-sm", !escuro && "text-muted-foreground")}
            style={escuro ? { color: "rgba(255,255,255,0.78)" } : undefined}
          >
            {label}
          </div>

          {temVariacao && (
            <span
              className="mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={
                subiu
                  ? { background: "#E2F5EC", color: "#17784F" }
                  : { background: "#FBE4E2", color: "#A3302A" }
              }
            >
              {subiu ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
              {Math.abs(variacao as number).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>

        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: escuro ? "rgba(255,255,255,0.15)" : "var(--color-accent-50)" }}
          aria-hidden
        >
          <Icone className="h-5 w-5" style={{ color: escuro ? "#FFFFFF" : "var(--color-accent-700)" }} />
        </span>
      </div>
    </div>
  );
}

export default KpiCard;

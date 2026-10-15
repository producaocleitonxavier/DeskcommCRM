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
  className?: string;
}

export function KpiCard({ label, valor, icone: Icone, variacao, cor, className }: KpiCardProps) {
  const temVariacao = typeof variacao === "number" && Number.isFinite(variacao);
  const subiu = (variacao ?? 0) >= 0;

  return (
    <div className={cn("wr-card p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="font-heading text-3xl font-bold tabular-nums leading-none"
            style={cor ? { color: cor } : undefined}
          >
            {valor.toLocaleString("pt-BR")}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{label}</div>

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
          style={{ background: "var(--color-accent-50)" }}
          aria-hidden
        >
          <Icone className="h-5 w-5" style={{ color: "var(--color-accent-700)" }} />
        </span>
      </div>
    </div>
  );
}

export default KpiCard;

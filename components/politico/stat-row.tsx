"use client";

/**
 * Linha de stats compacta — label + valor (+ ícone opcional), com dividers.
 * Para resumos rápidos dentro de seções menores.
 */

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StatRowItem {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** Cor opcional do valor. */
  color?: string;
}

export interface StatRowProps {
  items: StatRowItem[];
  className?: string;
}

export function StatRow({ items, className }: StatRowProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-3", className)}>
      {items.map((item, i) => {
        const Icone = item.icon;
        const valor = typeof item.value === "number" ? item.value.toLocaleString("pt-BR") : item.value;
        return (
          <div
            key={`${item.label}-${i}`}
            className={cn(
              "flex items-center gap-2.5",
              i > 0 && "border-l pl-6",
            )}
            style={i > 0 ? { borderColor: "var(--color-border)" } : undefined}
          >
            {Icone && (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "rgba(215,243,106,0.1)" }}
                aria-hidden
              >
                <Icone className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              </span>
            )}
            <div className="min-w-0">
              <div
                className="font-heading text-lg font-bold tabular-nums leading-none"
                style={{ color: item.color ?? "var(--color-accent)" }}
              >
                {valor}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{item.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default StatRow;

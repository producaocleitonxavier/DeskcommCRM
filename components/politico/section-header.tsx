"use client";

/**
 * Cabeçalho de seção — título + subtítulo opcional + ação (pill) à direita.
 * Consistente em todas as páginas do módulo político.
 */

import Link from "next/link";

import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  /** "accent" = pill lime (#D7F36A, texto dark); "default" = wr-btn com borda. */
  actionTone?: "default" | "accent";
  className?: string;
}

export function SectionHeader({ title, subtitle, action, actionTone = "default", className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="font-heading text-xl font-bold leading-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {action &&
        (actionTone === "accent" ? (
          <Link
            href={action.href}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-5 text-sm font-semibold"
            style={{ background: "#D7F36A", color: "#16181D" }}
          >
            {action.label}
          </Link>
        ) : (
          <Link href={action.href} className="wr-btn shrink-0">
            {action.label}
          </Link>
        ))}
    </div>
  );
}

export default SectionHeader;

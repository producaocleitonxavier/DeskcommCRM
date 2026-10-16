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
          <Link href={action.href} className="wr-btn-tactical shrink-0">
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

"use client";

/**
 * Estado vazio — ícone em círculo, título, descrição e CTA opcional.
 */

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
  className?: string;
}

export function EmptyState({ icon: Icone, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "rgba(215,243,106,0.1)", border: "1px solid rgba(215,243,106,0.2)" }}
        aria-hidden
      >
        <Icone className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
      </span>

      <h3 className="mt-4 font-heading text-lg font-bold" style={{ color: "var(--color-text)" }}>{title}</h3>
      <p className="mt-1.5 max-w-md text-sm" style={{ color: "var(--color-text-muted)" }}>{description}</p>

      {action && (
        <Link href={action.href} className="wr-btn-tactical mt-5">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export default EmptyState;

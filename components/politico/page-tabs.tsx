"use client";

/**
 * Abas de página (GIP) — funde telas relacionadas numa só entrada de menu,
 * acessíveis por abas no topo. Reusável (Comando, Funil, Config do Gabinete).
 */

import Link from "next/link";

export interface PageTab { id: string; label: string; href: string }

export default function PageTabs({ abas, active, maxW = "1040px" }: { abas: PageTab[]; active: string; maxW?: string }) {
  return (
    <div className="mx-auto px-4 pt-5" style={{ maxWidth: maxW }}>
      <div className="flex gap-1 overflow-x-auto rounded-full p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)" }}>
        {abas.map((a) => {
          const on = a.id === active;
          return (
            <Link
              key={a.id}
              href={a.href}
              className="whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
              style={on ? { background: "#D7F36A", color: "#16181D" } : { color: "var(--color-text-muted)" }}
            >
              {a.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

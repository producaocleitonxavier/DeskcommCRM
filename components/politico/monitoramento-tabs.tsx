"use client";

/**
 * Sub-navegação do módulo "Monitoramento" (GIP): funde Opinião Pública, Alertas,
 * Adversários e Decisão numa só entrada de menu, acessíveis por abas. A escuta
 * social alimenta as outras três via motor de sinais.
 */

import Link from "next/link";

const ABAS = [
  { id: "escuta", label: "Opinião Pública", href: "/app/politico/social" },
  { id: "alertas", label: "Alertas", href: "/app/politico/alertas" },
  { id: "adversarios", label: "Adversários", href: "/app/politico/adversarios" },
  { id: "decisao", label: "Decisão", href: "/app/politico/decisao" },
] as const;

export default function MonitoramentoTabs({ active }: { active: "escuta" | "alertas" | "adversarios" | "decisao" }) {
  return (
    <div className="mx-auto max-w-[1040px] px-4 pt-5">
      <div className="flex gap-1 overflow-x-auto rounded-full p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)" }}>
        {ABAS.map((a) => {
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

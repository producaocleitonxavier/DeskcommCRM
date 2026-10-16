"use client";

/**
 * WarRoomShell — ativa o tema "Sala de Guerra" (dark tático) enquanto montado.
 *
 * Aplica `data-theme="dark"` no <html> ao montar e restaura o valor anterior ao
 * desmontar (restaura, não apaga — respeita um theme provider externo, se houver).
 * Escopo: envolve o módulo político via app/app/politico/layout.tsx, então o
 * resto do DeskcommCRM NÃO é afetado.
 *
 * Os tokens dark do globals.css (`[data-theme="dark"]`) passam a valer, e a
 * classe `war-room` fornece o glow lime (`--wr-glow`) para `wr-card-dark`.
 */

import { useEffect } from "react";

export default function WarRoomShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const el = document.documentElement;
    const anterior = el.getAttribute("data-theme");
    el.setAttribute("data-theme", "dark");
    return () => {
      if (anterior === null) el.removeAttribute("data-theme");
      else el.setAttribute("data-theme", anterior);
    };
  }, []);

  return <div className="war-room">{children}</div>;
}

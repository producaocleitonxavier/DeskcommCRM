"use client";

/**
 * Navegação do "Radar da imprensa".
 *
 * Até 12/nov eram 4 abas (Opinião Pública, Alertas, Adversários, Decisão). As
 * três últimas saíram da frente por decisão do cliente: eram derivadas de um
 * noticiário que não citava o político (alerta velho, conselho genérico) e
 * ficavam rasas justo onde há comparação com ferramentas de escuta. As rotas
 * continuam existindo (nada foi apagado); só não são mais anunciadas. Nelas,
 * este componente mostra apenas o caminho de volta.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function MonitoramentoTabs({ active }: { active: "escuta" | "alertas" | "adversarios" | "decisao" }) {
  if (active === "escuta") return null;
  return (
    <div className="mx-auto max-w-[1040px] px-4 pt-5">
      <Link
        href="/app/politico/social"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"
        style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Radar da imprensa
      </Link>
    </div>
  );
}

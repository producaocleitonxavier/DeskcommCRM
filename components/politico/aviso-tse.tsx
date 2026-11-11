"use client";

/**
 * Aviso TSE (Lei 9.504/41-A) — a ADVERTÊNCIA de possível promessa de campanha,
 * compartilhada por todas as telas onde um humano escreve texto livre que vai
 * para o cidadão (avisos, disparo de pesquisa, enquete, legenda de vitória).
 *
 * É ADVERTÊNCIA, não trava: o humano lê o contexto e decide (ajusta ou envia
 * assim mesmo). O bloqueio duro é só no automático da IA. O detector é puro
 * (`detectarPromessaDeCampanha`), então roda no cliente e recalcula a cada tecla.
 *
 * Decisão do cliente (11/nov): "avisar e deixar decidir" para texto humano.
 */
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

import {
  detectarPromessaDeCampanha,
  type CategoriaDeCampanha,
} from "@/lib/agent-engine/guardrails/promessa-de-campanha";

/** Traduz as categorias do detector para uma frase que o assessor entende na hora. */
const FRASE_DA_CATEGORIA: Record<CategoriaDeCampanha, string> = {
  captacao_de_sufragio: "parece ligar voto ou apoio a um favor",
  promessa_de_beneficio: "parece prometer conseguir um benefício pessoal",
  garantia_eleitoral: "parece garantir um resultado de campanha",
};

/**
 * Aviso de possível promessa de campanha para o texto que o humano vai enviar.
 * Retorna `null` quando não há nada a avisar.
 */
export function avisoDePromessa(texto: string): string | null {
  const achado = detectarPromessaDeCampanha(texto);
  if (!achado.achou) return null;
  const partes = achado.categorias.map((c) => FRASE_DA_CATEGORIA[c]);
  return `Atenção (Lei 9.504): esse texto ${partes.join(" e ")}. Reveja — ou, se não for o caso, envie assim mesmo.`;
}

/** Recalcula o aviso a cada edição do texto (detector puro, roda no cliente). */
export function useAvisoTse(texto: string): string | null {
  return useMemo(() => avisoDePromessa(texto), [texto]);
}

/** Banner vermelho padrão do aviso. Não renderiza nada quando `aviso` é null. */
export function BannerAvisoTse({ aviso, className }: { aviso: string | null; className?: string }) {
  if (!aviso) return null;
  return (
    <p
      className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${className ?? ""}`}
      style={{ background: "rgba(239,68,68,0.12)", color: "#B91C1C" }}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{aviso}</span>
    </p>
  );
}

/**
 * Trava do texto escrito por PESSOA da equipe (14/nov, parecer jurídico).
 *
 * Promessa e garantia continuam como ADVERTÊNCIA (o humano lê o contexto e decide).
 * Uma coisa não tem contexto que salve: ligar voto ou apoio a favor, pedir
 * retribuição nas urnas ou ameaçar perda de benefício (Lei 9.504/97, art. 41-A).
 * Isso é BLOQUEIO para todos, na tela e no servidor — a mesma função nos dois lados.
 */
import { detectarPromessaDeCampanha } from "@/lib/agent-engine/guardrails/promessa-de-campanha";

export const MENSAGEM_DE_TROCA_POR_VOTO =
  "Este texto liga voto ou apoio a um favor, pede retribuição nas urnas ou ameaça perda de benefício. " +
  "Isso é captação ilícita de voto (Lei 9.504, art. 41-A) e não pode ser enviado. Reescreva sem essa ligação.";

/** Teto do aviso escrito por pessoa (o detector só lê até o próprio teto; o que passar disso não é conferido). */
export const TAMANHO_MAXIMO_DO_AVISO = 4000;

/** A mensagem de bloqueio, ou `null` quando o texto pode seguir. */
export function bloqueioDeTextoHumano(texto: string | null | undefined): string | null {
  if (!texto) return null;
  if (texto.length > TAMANHO_MAXIMO_DO_AVISO) {
    return `O texto está longo demais (máximo de ${TAMANHO_MAXIMO_DO_AVISO} letras). Encurte para enviar.`;
  }
  return detectarPromessaDeCampanha(texto).categorias.includes("captacao_de_sufragio")
    ? MENSAGEM_DE_TROCA_POR_VOTO
    : null;
}

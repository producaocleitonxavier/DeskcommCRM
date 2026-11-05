/**
 * A régua de SAÚDE DO NÚMERO para a tela de entregabilidade dos Disparos,
 * separada da página para ser testável sem montar o React. Traduz a linha crua de
 * `channel_session_health` (a decisão do motor) para o estado que o cliente lê.
 *
 * Fonte única de verdade: a decisão do motor. Esta função NÃO recalcula taxa de
 * bloqueio — só interpreta os flags que o circuito (`lib/agent-engine/health/
 * circuit.ts`) já gravou. A ordem dos ramos importa (ver cada um).
 */

export type SaudeDoNumero =
  | "saudavel"
  | "em_espera"
  | "aguardando_liberacao"
  | "sem_dados";

/** O recorte da linha de saúde que a classificação precisa. */
export interface LinhaDeSaude {
  health_hold_active: boolean;
  health_hold_reason: string | null;
  health_released_at: string | null;
}

export interface NumeroSaude {
  id: string;
  rotulo: string;
  telefone: string | null;
  statusConexao: string;
  saude: SaudeDoNumero;
  /** 'go_live' | 'block_rate' | 'response_rate' | null. */
  motivo: string | null;
  /** ISO de quando o hold começou. */
  desde: string | null;
  /** O diagnóstico que o próprio motor escreveu no inbox (só taxas/contagens). */
  diagnostico: string | null;
  enviadasHoje: number;
  tetoDiario: number | null;
}

/**
 * A régua, na ordem que o motor decide:
 *  1. sem linha de saúde → `sem_dados` (número nunca sincronizou saúde).
 *  2. nunca liberado (`health_released_at` null) → `aguardando_liberacao`
 *     (nasce em hold por segurança; só o go-live libera). Vem ANTES do hold
 *     ativo: um número novo que ainda não ligou o circuito tem `hold_active`
 *     false, mas NÃO está liberado — pintá-lo de "saudável" seria mentira.
 *  3. hold ativo com motivo go_live → `aguardando_liberacao` (born-held já ligado).
 *  4. hold ativo por queima/resposta → `em_espera`.
 *  5. liberado e sem hold → `saudavel`.
 */
export function classificar(h: LinhaDeSaude | undefined | null): SaudeDoNumero {
  if (!h) return "sem_dados";
  if (h.health_released_at === null) return "aguardando_liberacao";
  if (h.health_hold_active) {
    return h.health_hold_reason === "go_live" ? "aguardando_liberacao" : "em_espera";
  }
  return "saudavel";
}

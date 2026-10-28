/**
 * BLACKOUT ELEITORAL (TSE) — a Voz do Mandato NÃO deve enviar áudio no silêncio
 * de cada turno. A regra que seguimos: do início da véspera até o fim do dia
 * seguinte ao turno (uma janela conservadora que cobre o "72h ao redor do
 * turno" sem exigir hora exata).
 *
 * As datas de turno moram aqui, numa lista DE DADOS, vazia por enquanto: o
 * Cleiton é vereador (mandato 2025–2028) e não há turno iminente. Perto da
 * eleição, basta adicionar a data (YYYY-MM-DD, horário de Brasília) e o bloqueio
 * passa a valer sozinho — sem mexer na lógica de envio.
 *
 * Com a lista vazia, `dentroDoBlackout` é sempre `false` (não bloqueia nada).
 */

/** Datas de turno (YYYY-MM-DD). Preencher perto da eleição. */
export const TURNOS_ELEITORAIS: string[] = [];

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Está no silêncio eleitoral agora? Janela: véspera (−1 dia) até fim do dia
 * seguinte (+1 dia) de cada turno. Lista vazia ⇒ nunca bloqueia. */
export function dentroDoBlackout(agora: Date = new Date(), turnos: string[] = TURNOS_ELEITORAIS): boolean {
  const t = agora.getTime();
  for (const d of turnos) {
    const base = new Date(`${d}T00:00:00-03:00`);
    if (Number.isNaN(base.getTime())) continue;
    const inicio = base.getTime() - UM_DIA_MS; // começa na véspera
    const fim = base.getTime() + 2 * UM_DIA_MS; // até o fim do dia seguinte
    if (t >= inicio && t <= fim) return true;
  }
  return false;
}

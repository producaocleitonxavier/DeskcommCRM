/**
 * BLACKOUT ELEITORAL (TSE) — a Voz do Mandato NÃO deve enviar áudio no silêncio
 * de cada turno. A regra que seguimos: do início da véspera até o fim do dia
 * seguinte ao turno (uma janela conservadora que cobre o "72h ao redor do
 * turno" sem exigir hora exata).
 *
 * As datas NÃO dependem de alguém lembrar de cadastrar: saem da regra da
 * Constituição (arts. 28, 29 e 77) — em todo ano PAR há eleição, com o 1º turno
 * no primeiro domingo de outubro e o 2º turno no último domingo de outubro.
 * O 2º turno é tratado como se sempre houvesse (pode não haver na cidade ou no
 * cargo): errar para o lado do silêncio custa três dias sem áudio; errar para o
 * outro lado é enviar voz clonada na boca da urna.
 *
 * Se uma emenda mudar o calendário de um ano (aconteceu em 2020: 15 e 29/nov),
 * registre o ano em `CALENDARIO_EXCEPCIONAL` — ele SUBSTITUI a regra naquele ano.
 */

/** Anos em que o calendário fugiu da regra: ano → datas de turno (YYYY-MM-DD). */
export const CALENDARIO_EXCEPCIONAL: Record<number, string[]> = {};

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** As datas de turno de um ano (YYYY-MM-DD). Ano ímpar não tem eleição. */
export function turnosDoAno(ano: number, excepcional: Record<number, string[]> = CALENDARIO_EXCEPCIONAL): string[] {
  const proprio = excepcional[ano];
  if (proprio) return proprio;
  if (!Number.isInteger(ano) || ano % 2 !== 0) return [];
  // Dia da semana de 1º/out (UTC, só para a conta de calendário): 0 = domingo.
  const semana1 = new Date(Date.UTC(ano, 9, 1)).getUTCDay();
  const primeiroDomingo = 1 + ((7 - semana1) % 7);
  const semana31 = new Date(Date.UTC(ano, 9, 31)).getUTCDay();
  const ultimoDomingo = 31 - semana31;
  return [iso(ano, 10, primeiroDomingo), iso(ano, 10, ultimoDomingo)];
}

/** Está no silêncio eleitoral agora? Janela: véspera (−1 dia) até fim do dia
 * seguinte (+1 dia) de cada turno, no horário de Brasília. `turnos` só é passado
 * em teste; no uso real as datas vêm de `turnosDoAno`. */
export function dentroDoBlackout(agora: Date = new Date(), turnos?: string[]): boolean {
  const t = agora.getTime();
  if (Number.isNaN(t)) return false;
  const ano = agora.getUTCFullYear();
  // Ano vizinho entra para a virada de ano em UTC e para calendário excepcional.
  const datas = turnos ?? [...turnosDoAno(ano - 1), ...turnosDoAno(ano), ...turnosDoAno(ano + 1)];
  for (const d of datas) {
    const base = new Date(`${d}T00:00:00-03:00`);
    if (Number.isNaN(base.getTime())) continue;
    const inicio = base.getTime() - UM_DIA_MS; // começa na véspera
    const fim = base.getTime() + 2 * UM_DIA_MS; // até o fim do dia seguinte
    if (t >= inicio && t < fim) return true;
  }
  return false;
}

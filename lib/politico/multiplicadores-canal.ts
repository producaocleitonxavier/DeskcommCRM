/**
 * NÚMERO DEDICADO DOS MULTIPLICADORES (anti-ban) — qual canal/número dispara os
 * convites e os links aos multiplicadores.
 *
 * Doutrina: o número do GABINETE é precioso (atendimento 1:1) e não pode queimar
 * com volume. Quando o cliente tiver um 2º número, aponta aqui — e o disparo dos
 * multiplicadores sai por ele, isolando o risco. Por ora, ausente = AUTOMÁTICO
 * (o sistema escolhe a sessão pronta, como antes).
 *
 * A chave vive em `organizations.settings.multiplicadores.canal_session_id`
 * (jsonb compartilhado — grava mesclando, preservando o resto). Mesmo padrão
 * seguro de leitura do `aviso-de-resolucao.ts`.
 */
export const CHAVE_MULTIPLICADORES = "multiplicadores";
export const CHAVE_CANAL = "canal_session_id";

/** O id da sessão de canal dedicada aos multiplicadores, ou null (= automático). */
export function lerCanalMultiplicadores(settings: unknown): string | null {
  if (!settings || typeof settings !== "object") return null;
  const mult = (settings as Record<string, unknown>)[CHAVE_MULTIPLICADORES];
  if (!mult || typeof mult !== "object") return null;
  const v = (mult as Record<string, unknown>)[CHAVE_CANAL];
  return typeof v === "string" && v.trim() ? v : null;
}

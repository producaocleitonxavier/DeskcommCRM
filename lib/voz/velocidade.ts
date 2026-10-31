/**
 * VELOCIDADE DA VOZ DO MANDATO — preferência por organização, guardada em
 * `organizations.settings.gabinete.voz_speed` (jsonb COMPARTILHADO, mesmo padrão
 * do aviso de resolução — ver `lib/politico/aviso-de-resolucao.ts`). Fica aqui,
 * e não numa coluna de `pol_voz_config`, pra NÃO exigir migration: é só uma
 * preferência de UX, não parte da trava de compliance.
 *
 * Faixa aceita pelo ElevenLabs: [0.7, 1.2] (1.0 = normal). Padrão 0.9 = um
 * pouco mais devagar (o 1.0 soou apressado no clone do Cleiton).
 *
 * Este módulo é PURO (sem dependência de servidor) de propósito: a tela
 * (client) importa os presets daqui, então não pode arrastar `elevenlabs.ts`
 * (que lê a chave) pro bundle do navegador. Por isso o padrão mora AQUI e o
 * adaptador importa daqui, não o contrário.
 */

/** Velocidade padrão da fala (0.9 = um pouco mais devagar que o normal). */
export const VOZ_SPEED_PADRAO = 0.9;

export const CHAVE_GABINETE = "gabinete";
export const CHAVE_VOZ_SPEED = "voz_speed";

/** Presets "à prova de criança" oferecidos na tela (rótulo → valor). */
export const VOZ_SPEED_PRESETS = [
  { valor: 1.0, rotulo: "Normal" },
  { valor: 0.9, rotulo: "Um pouco mais devagar" },
  { valor: 0.8, rotulo: "Devagar" },
  { valor: 0.75, rotulo: "Bem devagar" },
] as const;

export function clampVozSpeed(s: unknown): number {
  const n = typeof s === "number" ? s : Number(s);
  if (!Number.isFinite(n)) return VOZ_SPEED_PADRAO;
  return Math.min(1.2, Math.max(0.7, n));
}

/** Lê a velocidade salva no `settings` da org. Ausente = padrão 0.9. */
export function lerVozSpeed(settings: unknown): number {
  if (!settings || typeof settings !== "object") return VOZ_SPEED_PADRAO;
  const gab = (settings as Record<string, unknown>)[CHAVE_GABINETE];
  if (!gab || typeof gab !== "object") return VOZ_SPEED_PADRAO;
  const raw = (gab as Record<string, unknown>)[CHAVE_VOZ_SPEED];
  if (raw === undefined || raw === null) return VOZ_SPEED_PADRAO;
  return clampVozSpeed(raw);
}

export const CHAVE_VOZ_ROTULO_NO_AUDIO = "voz_rotulo_no_audio";

/**
 * O aviso de IA vai DENTRO do áudio (falado)? Padrão = FALSE: fora de período
 * eleitoral (decisão 31/out) o áudio sai limpo e o aviso de IA vai numa mensagem
 * de TEXTO curta junto. Em MODO CAMPANHA (TSE 23.755/2026 exige o aviso no
 * próprio áudio), ligar isto (settings.gabinete.voz_rotulo_no_audio = true).
 * Mesma gaveta jsonb da velocidade — sem migration.
 */
export function lerRotuloNoAudio(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  const gab = (settings as Record<string, unknown>)[CHAVE_GABINETE];
  if (!gab || typeof gab !== "object") return false;
  return (gab as Record<string, unknown>)[CHAVE_VOZ_ROTULO_NO_AUDIO] === true;
}

/**
 * CICLO DA DEMANDA — liga/desliga o aviso AUTOMÁTICO ao cidadão quando a demanda
 * é resolvida ("resolvemos o que você pediu").
 *
 * A chave e o default moram aqui; a gravação em
 * `app/actions/politico/definirAvisoDeResolucao.ts`, e a leitura no momento do
 * envio em `avisarResolucaoAutomatica` (`app/actions/politico/avisarCidadao.ts`).
 *
 * `organizations.settings` é jsonb COMPARTILHADO: a chave vive sob `gabinete`
 * para não colidir com `branding`, `conversions`, `automacoes` e o resto. Quem
 * grava mescla nos dois níveis (preservar o que não é nosso).
 *
 * Default LIGADO: avisar da resolução é a doutrina do produto — o momento
 * político de maior valor. A org desliga explicitamente se preferir o aviso
 * manual. Ausente/null = ligado; só `false` desliga.
 */
export const CHAVE_GABINETE = "gabinete";
export const CHAVE_AVISO_RESOLUCAO = "aviso_resolucao_auto";

export function avisoDeResolucaoLigado(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return true;
  const gab = (settings as Record<string, unknown>)[CHAVE_GABINETE];
  if (!gab || typeof gab !== "object") return true;
  return (gab as Record<string, unknown>)[CHAVE_AVISO_RESOLUCAO] !== false;
}

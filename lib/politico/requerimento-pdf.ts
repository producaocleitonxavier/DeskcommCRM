/**
 * Regras PURAS do requerimento de comissão em PDF: o título, a conferência do
 * texto antes de imprimir e a leitura da configuração guardada do gabinete.
 */

export type TipoDoRequerimentoPdf = "visita_tecnica" | "audiencia_publica";

export type ConfigDoRequerimento = { comissao: string; dispositivo: string };

/** Teto do texto que vira PDF (um requerimento real tem 1 a 2 páginas). */
export const TAMANHO_MAXIMO_DO_REQUERIMENTO = 12000;

export function tituloDoRequerimento(tipo: TipoDoRequerimentoPdf): string {
  return tipo === "audiencia_publica" ? "REQUERIMENTO DE AUDIÊNCIA PÚBLICA" : "REQUERIMENTO DE VISITA TÉCNICA";
}

/** O texto ainda tem algo entre [COLCHETES] — o que a IA não sabia e deixou para a equipe. */
export function temLacuna(texto: string): boolean {
  return /\[[^\]\n]{3,}\]/.test(texto);
}

/** Por que o texto NÃO pode virar PDF, em português simples; `null` quando pode. */
export function problemaDoTextoDoRequerimento(texto: unknown): string | null {
  if (typeof texto !== "string" || texto.trim().length === 0) return "Redija o texto antes de gerar o PDF.";
  if (texto.length > TAMANHO_MAXIMO_DO_REQUERIMENTO) {
    return `O texto está longo demais (máximo de ${TAMANHO_MAXIMO_DO_REQUERIMENTO} letras). Encurte para gerar o PDF.`;
  }
  if (temLacuna(texto)) return "Ainda há trechos entre [COLCHETES]. Preencha ou apague antes de gerar o PDF.";
  return null;
}

/** Lê `settings.gabinete.requerimento`; qualquer forma inesperada vira vazio. */
export function configDoRequerimentoDeSettings(settings: unknown): ConfigDoRequerimento {
  const vazio: ConfigDoRequerimento = { comissao: "", dispositivo: "" };
  if (!settings || typeof settings !== "object") return vazio;
  const gabinete = (settings as Record<string, unknown>).gabinete;
  if (!gabinete || typeof gabinete !== "object") return vazio;
  const r = (gabinete as Record<string, unknown>).requerimento;
  if (!r || typeof r !== "object") return vazio;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  return { comissao: texto((r as Record<string, unknown>).comissao), dispositivo: texto((r as Record<string, unknown>).dispositivo) };
}

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

/** Cada trecho entre colchetes que ainda falta preencher, com a posição no texto. */
export function lacunasDoTexto(texto: string): { inicio: number; fim: number; trecho: string }[] {
  const achados: { inicio: number; fim: number; trecho: string }[] = [];
  for (const m of texto.matchAll(/\[[^\]\n]{3,}\]/g)) {
    const inicio = m.index ?? 0;
    achados.push({ inicio, fim: inicio + m[0].length, trecho: m[0] });
  }
  return achados;
}

const MARCADOR = "• ";

/**
 * Enter dentro de uma lista: a linha nova já nasce com o marcador. Enter numa
 * linha que só tem o marcador ENCERRA a lista (tira o marcador). Fora de lista
 * devolve `null` e o Enter segue normal.
 */
export function enterEmLista(texto: string, inicio: number, fim: number): { texto: string; cursor: number } | null {
  const comecoDaLinha = texto.lastIndexOf("\n", inicio - 1) + 1;
  const ateOCursor = texto.slice(comecoDaLinha, inicio);
  if (!ateOCursor.startsWith(MARCADOR)) return null;
  if (ateOCursor.trim() === MARCADOR.trim() && inicio === fim) {
    const fimDaLinha = texto.indexOf("\n", inicio);
    const resto = texto.slice(inicio, fimDaLinha === -1 ? texto.length : fimDaLinha);
    if (resto.trim() === "") {
      // linha só com o marcador: sai da lista
      return { texto: texto.slice(0, comecoDaLinha) + texto.slice(inicio), cursor: comecoDaLinha };
    }
  }
  const inserido = "\n" + MARCADOR;
  return { texto: texto.slice(0, inicio) + inserido + texto.slice(fim), cursor: inicio + inserido.length };
}

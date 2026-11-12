/**
 * NOTA DO CIDADÃO — as partes PURAS (texto e leitura), usadas pelo servidor, pela
 * tela do gabinete e pela página pública. Sem I/O.
 *
 * A pergunta vai colada no aviso de resolução/encerramento, como UMA linha com
 * link. Nada de pedir voto, elogio ou apoio: é só "como foi o atendimento?".
 */

export const NOTA_MIN = 1;
export const NOTA_MAX = 5;

/** O que cada nota quer dizer — a mesma palavra na página pública e na tela do gabinete. */
export const ROTULO_DA_NOTA: Record<number, string> = {
  1: "Muito ruim",
  2: "Ruim",
  3: "Regular",
  4: "Bom",
  5: "Muito bom",
};

/** A nota é um inteiro de 1 a 5? (qualquer outra coisa é recusada) */
export function notaValida(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= NOTA_MIN && n <= NOTA_MAX;
}

/** A linha que vai no fim do aviso. Vazio quando não há link (nunca manda link quebrado). */
export function linhaDeAvaliacao(link: string | null | undefined): string {
  const l = (link ?? "").trim();
  return l ? `\n\nComo foi o nosso atendimento? Leva 10 segundos pra responder:\n${l}` : "";
}

/** Nota baixa pede atenção de alguém do gabinete (1 ou 2). */
export function notaPedeAtencao(n: number | null | undefined): boolean {
  return typeof n === "number" && n <= 2;
}

export interface ResumoDeNotas {
  /** Quantas avaliações respondidas. */
  total: number;
  /** Média com uma casa (null sem resposta). */
  media: number | null;
  /** Quantas notas 1 ou 2. */
  baixas: number;
}

/** Resume uma lista de notas (ignora o que não é nota válida). */
export function resumirNotas(notas: readonly unknown[]): ResumoDeNotas {
  const boas = notas.filter(notaValida);
  if (boas.length === 0) return { total: 0, media: null, baixas: 0 };
  const soma = boas.reduce((a, b) => a + b, 0);
  return {
    total: boas.length,
    media: Math.round((soma / boas.length) * 10) / 10,
    baixas: boas.filter((n) => n <= 2).length,
  };
}

/** "4,5" — média no padrão brasileiro (vírgula). */
export function mediaPtBR(media: number | null): string {
  return media === null ? "—" : media.toFixed(1).replace(".", ",");
}

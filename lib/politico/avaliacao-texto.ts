/**
 * NOTA DO CIDADÃO — as partes PURAS (texto e leitura), usadas pelo servidor, pela
 * tela do gabinete e pela página pública. Sem I/O.
 *
 * Nada de pedir voto, elogio ou apoio: é só "como foi o atendimento?".
 */

export const NOTA_MIN = 1;
export const NOTA_MAX = 5;

/** O que cada nota quer dizer — a mesma palavra na mensagem, na página e na tela do gabinete. */
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

/**
 * A PERGUNTA — vai numa SEGUNDA mensagem, logo depois do aviso, e SEM LINK
 * (decisão de 12/nov: muita gente acha que link é vírus). A pessoa responde só
 * com o número, como numa enquete.
 */
export function perguntaDeAvaliacao(): string {
  const linhas = Object.entries(ROTULO_DA_NOTA).map(([n, r]) => `${n} - ${r}`);
  return [
    `Uma pergunta rápida: de ${NOTA_MIN} a ${NOTA_MAX}, como foi o nosso atendimento?`,
    "",
    ...linhas,
    "",
    "É só responder com o número.",
  ].join("\n");
}

const POR_EXTENSO: Record<string, number> = { um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5 };

/**
 * Lê a nota de uma RESPOSTA do cidadão. Só vale quando a mensagem É a nota
 * ("5", "nota 5", "5!", "5️⃣", "cinco") — frase com número no meio ("5 pessoas
 * vieram aqui", "15") NÃO é nota. `null` = não é uma resposta de avaliação.
 */
export function lerNotaDaResposta(texto: string | null | undefined): number | null {
  const t = (texto ?? "")
    .normalize("NFD")
    // acentos + os dois caracteres invisíveis do emoji de tecla (5️⃣)
    .replace(/[̀-ͯ️⃣]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[.!\s]+$/g, "");
  if (!t) return null;
  const semPrefixo = t.replace(/^nota\s*:?\s*/, "");
  if (/^[1-5]$/.test(semPrefixo)) return Number(semPrefixo);
  return POR_EXTENSO[semPrefixo] ?? null;
}

/** O que o gabinete responde depois da nota. Nota baixa abre a porta para a pessoa contar. */
export function agradecimentoDaNota(nota: number): string {
  return nota <= 2
    ? "Obrigado por nos dizer isso. Se quiser contar o que faltou, é só escrever aqui: alguém do gabinete vai ler."
    : "Obrigado pela sua avaliação! Ela ajuda o gabinete a atender melhor.";
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

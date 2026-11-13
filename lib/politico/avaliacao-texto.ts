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
export const ABERTURA_DA_PERGUNTA = `Uma pergunta rápida: de ${NOTA_MIN} a ${NOTA_MAX}, como foi o nosso atendimento?`;

export function perguntaDeAvaliacao(): string {
  const linhas = Object.entries(ROTULO_DA_NOTA).map(([n, r]) => `${n} - ${r}`);
  return [
    ABERTURA_DA_PERGUNTA,
    "",
    ...linhas,
    "",
    "É só responder com o número.",
  ].join("\n");
}

const POR_EXTENSO = new Map<string, number>([["um", 1], ["dois", 2], ["tres", 3], ["quatro", 4], ["cinco", 5]]);

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
  // Map (e não objeto): "constructor"/"__proto__" não podem virar "nota".
  return POR_EXTENSO.get(semPrefixo) ?? null;
}

/** Depois disso a pergunta "venceu": um número solto não é mais lido como nota. */
export const DIAS_PARA_RESPONDER = 10;

export interface UltimaSaida {
  body: string | null;
  created_at: string | null;
  status?: string | null;
  type?: string | null;
}

/**
 * A resposta do cidadão É resposta à nossa pergunta? Só quando a ÚLTIMA mensagem
 * que o gabinete mandou naquela conversa foi a pergunta (e saiu de verdade, há
 * no máximo 10 dias). Se depois da pergunta alguém — assessor ou IA — mandou
 * qualquer outra coisa ("quantas pessoas moram na casa?"), o "2" que vier NÃO é
 * nota. Achado da revisão independente de 12/nov.
 */
export function respostaEhDaPergunta(ultima: UltimaSaida | null, agoraMs: number): boolean {
  // "failed" não saiu; "queued" ficou na fila e pode nunca ter chegado.
  if (!ultima || ultima.status === "failed" || ultima.status === "queued") return false;
  // `includes` (e não `startsWith`): tolera assinatura do emissor antes do texto.
  if (!(ultima.body ?? "").includes(ABERTURA_DA_PERGUNTA)) return false;
  const quando = Date.parse(ultima.created_at ?? "");
  return Number.isFinite(quando) && quando <= agoraMs && agoraMs - quando <= DIAS_PARA_RESPONDER * 24 * 60 * 60 * 1000;
}

/**
 * A pergunta está VALENDO nesta conversa? Recebe as últimas mensagens que o
 * gabinete mandou (da mais nova para a mais velha). Vale quando a pergunta é a
 * mensagem mais recente que de fato saiu — tolerando, depois dela, só o recado em
 * ÁUDIO do mandato e o aviso escrito que o acompanha (`textosTolerados`), que
 * não são pergunta nenhuma. Mensagem que falhou ou ficou na fila é ignorada.
 * Qualquer outro texto depois da pergunta a derruba. (2ª revisão, 12/nov.)
 */
export function perguntaEstaValendo(saidas: readonly UltimaSaida[], agoraMs: number, textosTolerados: readonly string[] = []): boolean {
  for (const s of saidas) {
    if (s.status === "failed" || s.status === "queued") continue;
    if (s.type === "audio") continue;
    if (textosTolerados.includes((s.body ?? "").trim())) continue;
    return respostaEhDaPergunta(s, agoraMs);
  }
  return false;
}

/**
 * De QUAL demanda é a nota, quando a pessoa tem mais de uma pergunta em aberto:
 * a da pergunta enviada por último (pelo registro no histórico). Sem registro,
 * só decide se houver uma única pendente — com duas, não adivinha.
 */
export function escolherDemandaDaNota(
  pendentes: readonly string[],
  perguntas: readonly { demanda_id: string; created_at: string }[],
): string | null {
  if (pendentes.length === 0) return null;
  const validas = perguntas
    .filter((p) => pendentes.includes(p.demanda_id) && Number.isFinite(Date.parse(p.created_at)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (validas[0]) return validas[0].demanda_id;
  return pendentes.length === 1 ? pendentes[0]! : null;
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

/**
 * PROMESSA DE CAMPANHA NA BOCA DO ASSISTENTE — o detector do `campaignPromiseGate`.
 *
 * ## O problema
 *
 * Num gabinete, numa pré-candidatura ou numa campanha, três frases não podem sair do
 * assistente, por mais que o prompt peça: oferecer alguma coisa EM TROCA DO VOTO ("vote
 * em mim que eu te consigo a vaga"), prometer que vai CONSEGUIR um benefício pessoal para
 * aquela pessoa ("vou conseguir sua aposentadoria", "garanto sua vaga na creche") e
 * GARANTIR um resultado de campanha ("prometo que vou acabar com a fila do SUS"). A
 * primeira é captação ilícita de sufrágio — crime eleitoral (Lei 9.504/97 art. 41-A, e
 * art. 299 do Código Eleitoral): o número responde pelo candidato, e uma frase dessas,
 * escrita, é a prova. As outras duas obrigam quem não tem como cumprir e, quando partem
 * de quem pede voto, escorregam para a mesma captação.
 *
 * Opinião e promessa eleitoral são, ainda, dado sensível (LGPD art. 11): não é só risco
 * de TSE, é tratamento de dado que a operação não quer dar na mão de um modelo de texto.
 *
 * Os outros portões da cadeia (`promise`, `clinical_claim`, `internal_vocabulary`) são a
 * mesma ideia aplicada a outro risco: uma regra fixa, sem custo de modelo, que barra a
 * frase e devolve ao modelo o que fazer no lugar.
 *
 * ## Por que é OPCIONAL por organização (camada `promessa_de_campanha`)
 *
 * Fora da política, as mesmas palavras são rotina: "consigo o seu orçamento", "te garanto
 * a entrega", "vote na enquete". O detector já é estreito (ver abaixo), mas o produto é
 * multi-nicho e a pergunta da doutrina de extensões vale: se nenhuma organização ligar
 * isto, a operação comum continua inteira. Por isso nasce DESLIGADO e quem é de gabinete/
 * campanha liga em Segurança. É o mesmo desenho do `afirmacao_clinica`.
 *
 * ## Um idioma: português do Brasil
 *
 * Diferente do `afirmacao_clinica` (que cobre PT e ES por atender clínica hispanofalante),
 * aqui a lei é brasileira e o vocabulário é o do WhatsApp de base eleitoral — só PT-BR.
 * Termo novo entra com um caso em `promessa-de-campanha.test.ts`, nos dois sentidos
 * (uma frase que ele PEGA e uma vizinha legítima que ele DEIXA passar).
 *
 * ## O que ele NÃO pega, de propósito — a rotina do gabinete
 *
 * - ENCAMINHAR demanda. "Vou encaminhar seu pedido de poda à secretaria", "registrei sua
 *   demanda", "a equipe vai analisar e te retorna" são o trabalho legítimo do mandato —
 *   processo, não promessa. Os verbos de processo (encaminhar/registrar/analisar/verificar/
 *   acompanhar/protocolar) não estão nas listas, então passam sem regra especial.
 * - VISÃO ampla. "Quando eu for eleito, vou trabalhar pela saúde da cidade" é bandeira, não
 *   garantia de resultado individual: "trabalhar por" não casa nenhum verbo de entrega.
 * - Pergunta GENUÍNA. "Você precisa de uma vaga na creche?" repete o pedido do cidadão e não
 *   usa verbo de ENTREGA — passa. Mas uma promessa disfarçada de pergunta ("garanto sua vaga,
 *   combinado?") NÃO escapa: o que conta é o verbo de entrega, não o ponto de interrogação.
 * - Frase NEGADA. "Não posso garantir sua aposentadoria", "a gente não promete vaga, mas
 *   encaminha" são o oposto da promessa — a negação antes do verbo desarma.
 *
 * É REDE, não cura — como o `internal_vocabulary` e o `clinical_claim`. A cura é o prompt
 * e o modelo; isto pega o que escapa e vira número no `before_send_traces`.
 */

/** As três categorias. Rótulos NOSSOS e fechados: vão ao trace, nunca o texto. */
export type CategoriaDeCampanha =
  | 'captacao_de_sufragio'
  | 'promessa_de_beneficio'
  | 'garantia_eleitoral';

export interface AchadoDeCampanha {
  achou: boolean;
  categorias: CategoriaDeCampanha[];
}

/**
 * Benefício PESSOAL e individual que um cidadão pede a um gabinete — o objeto que
 * transforma "vou conseguir" em promessa que obriga e, na boca de quem pede voto, em
 * captação. Lista curta e do vocabulário real da base eleitoral, não um rol exaustivo.
 * Termo novo entra com um caso no teste. Obras públicas amplas (asfalto da rua, fila do
 * SUS) ficam na `garantia_eleitoral`, pelo verbo, não aqui.
 */
const BENEFICIOS =
  'emprego|empregos|vaga|vagas|cesta\\s+b[aá]sica|cestas?\\s+b[aá]sicas?|aux[ií]lio(?:\\s+[a-zç]+)?|' +
  'bolsa\\s+fam[ií]lia|bolsa\\s+de\\s+estudos?|bpc|loas|aposentadoria|pens[aã]o|benef[ií]cio(?:\\s+do\\s+inss)?|' +
  'consulta|cirurgia|exame|exames|rem[eé]dio|rem[eé]dios|medicamento|tratamento|leito|' +
  'dinheiro|pix|grana|vale(?:\\s+[a-zç]+)?|moradia|casa\\s+popular|casa\\s+pr[oó]pria|apartamento|' +
  'lote|terreno|material\\s+de\\s+constru[cç][aã]o|cal[cç]amento|creche|matr[ií]cula|farda|uniforme|' +
  // Ampliado: itens de saúde/assistência que o cidadão pede ao gabinete e que
  // escapavam da lista fechada (cada um com caso no teste).
  'pr[oó]tese|cadeira\\s+de\\s+rodas|cadeira\\s+de\\s+banho|andador|muleta|muletas|[oó]culos|' +
  'cnh|carteira\\s+de\\s+motorista|alvar[aá]|licen[cç]a|enxoval|fralda|fraldas|fralda\\s+geri[aá]trica';

/**
 * Limites de palavra que entendem acento. O `\b` do JavaScript só conhece
 * `[A-Za-z0-9_]`, mesmo com a flag `u`: entre um espaço e "é" ele não vê fronteira.
 * Mesma solução do `afirmacao-clinica.ts`.
 */
const INICIO = String.raw`(?<![\p{L}\p{N}_])`;
const FIM = String.raw`(?![\p{L}\p{N}_])`;
const palavra = (alternativas: string): string => `${INICIO}(?:${alternativas})${FIM}`;

/** Artigo/possessivo opcional entre o verbo e o benefício: "sua vaga", "um emprego", "o auxílio". */
const DETERMINANTE = String.raw`(?:(?:seu|sua|seus|suas|o|a|os|as|um|uma|uns|umas|lhe|te|pra\s+voc[eê]|para\s+voc[eê])\s+)*`;

/**
 * Advérbio opcional entre o verbo e o benefício: "conseguir RAPIDINHO a sua
 * vaga", "garantir JÁ o seu auxílio". Antes, qualquer palavra no meio quebrava o
 * casamento e a promessa escapava.
 */
const ADVERBIO_OPC = String.raw`(?:(?:[a-zç]+mente|rapidinho|rapid[aã]o|logo|j[aá]|certinho|f[aá]cil|sim|tamb[eé]m)\s+)?`;

/**
 * A negação que transforma promessa em orientação. O `posso`/`vou`/`consigo` opcional
 * cobre "não posso garantir", "não vou conseguir", "não consigo prometer" — a locução
 * inteira nega o verbo. Mesmo desenho do `NAO_NEGADO` clínico.
 */
const NAO_NEGADO = String.raw`(?<!(?:n[aã]o|nunca|jamais|sem)\s+(?:(?:posso|poderia|consigo|vou|d[aá]\s+para)\s+)?)`;

/**
 * Verbo de PRIMEIRA PESSOA que entrega/consegue/garante algo a alguém — o que, seguido de
 * um benefício, vira promessa. "Encaminhar/analisar/registrar" NÃO estão aqui de propósito:
 * é o que separa a promessa (barrada) do trabalho de gabinete (liberado).
 */
const VERBOS_DE_ENTREGA =
  // Futuro/1ª pessoa SINGULAR e PLURAL e "a gente vai": "vou/vamos/irei/iremos/a
  // gente vai conseguir". Fecha o escape de plural e 3ª pessoa que o detector
  // antigo não via (só pegava "vou conseguir" no singular).
  String.raw`(?:vou|vamos|irei|iremos|a\s+gente\s+vai)\s+(?:te\s+|lhe\s+)?(?:conseguir|arranjar|dar|garantir|liberar|providenciar|resolver|assegurar)|` +
  // Presente, "a gente consegue/arranja/…": a forma coloquial de prometer.
  String.raw`a\s+gente\s+(?:te\s+)?(?:consegue|arranja|d[aá]|garante|libera|providencia|resolve|assegura)|` +
  // Presente 1ª pessoa singular e plural.
  String.raw`consigo|conseguimos|arranjo|arranjamos|te\s+dou|dou\s+(?:pra|para)\s+voc[eê]|damos|` +
  String.raw`garanto|garantimos|libero|liberamos|providencio|providenciamos|resolvo|resolvemos|asseguro|asseguramos`;

/** Token de voto/apoio — o que, ligado a uma entrega, fecha a captação de sufrágio. */
const VOTO = String.raw`voto|votar|vota|vote|me\s+(?:apoiar|apoie|apoia)|seu\s+apoio`;

/** Verbos de entrega usados na troca por voto (forma curta, sem o "vou" obrigatório). */
const ENTREGA_CURTA = String.raw`dou|te\s+dou|consigo|arranjo|libero|garanto|resolvo|providencio|vou\s+(?:te\s+)?(?:dar|conseguir|arranjar|liberar|garantir)`;

/** Verbos de resultado prometido com garantia — o "vai acontecer, pode confiar". */
const VERBOS_DE_RESULTADO =
  String.raw`resolver|conseguir|acabar\s+com|construir|asfaltar|entregar|fazer|trazer|consertar|reformar|garantir`;

/** Marcadores de garantia (extraídos para constante: nada de template literal aninhado). */
const MARCADOR_PROMESSA = String.raw`prometo|garanto|juro`;
const MARCADOR_CERTEZA = String.raw`pode\s+ter\s+certeza|fica\s+tranquil[oa]|com\s+certeza`;
const GARANTIA_LITERAL = String.raw`resultado\s+garantido|garantia\s+de\s+(?:resultado|entrega)|100\s*%\s+garantid[oa]`;

const REGRAS: ReadonlyArray<{ categoria: CategoriaDeCampanha; padrao: RegExp; perguntaDesarma: boolean }> = [
  {
    // CAPTAÇÃO DE SUFRÁGIO — voto ligado a uma entrega, nos dois sentidos dentro da frase.
    // Oferta vale mesmo em pergunta ("vota em mim que eu te arranjo um emprego?"), como a
    // prescrição clínica: por isso `perguntaDesarma: false`.
    categoria: 'captacao_de_sufragio',
    padrao: new RegExp(
      [
        // "em troca do seu voto", "em troca de voto" — nos dois sentidos.
        String.raw`em\s+troca\s+d[eo]\s+(?:seu\s+)?(?:${VOTO})`,
        String.raw`(?:${VOTO})\s+em\s+troca`,
        // "vote em mim QUE eu te dou/consigo…" — a conjunção liga voto à entrega.
        String.raw`${palavra(VOTO)}\s+(?:em\s+mim|n[oa]\s+[a-zç]+|aqui)?\s*,?\s*que\s+(?:eu\s+)?(?:te\s+)?(?:${ENTREGA_CURTA})`,
        // "se você votar em mim, eu te arranjo…" — voto condicional + entrega até 40 chars.
        String.raw`(?:se\s+)?(?:voc[eê]|vc)\s+votar?\s+(?:em\s+mim|n[oa]\s+[a-zç]+)[,\s].{0,40}?(?:${ENTREGA_CURTA})`,
        // "eu te dou um emprego se você votar…" — entrega + voto condicional até 40 chars.
        String.raw`(?:${ENTREGA_CURTA}).{0,40}?(?:se|caso)\s+(?:voc[eê]|vc)\s+votar`,
      ].join('|'),
      'iu',
    ),
    perguntaDesarma: false,
  },
  {
    // PROMESSA DE BENEFÍCIO PESSOAL — "vou conseguir sua aposentadoria", "garanto sua vaga".
    // Exige o verbo de entrega (1ª pessoa singular/plural ou "a gente"), não negado, com
    // advérbio e determinante opcionais, seguido de um benefício pessoal. A pergunta NÃO
    // desarma: "garanto sua vaga, combinado?" é promessa, não pergunta de verdade — a frase
    // usa um verbo de ENTREGA (os verbos de processo, encaminhar/registrar, continuam fora).
    categoria: 'promessa_de_beneficio',
    padrao: new RegExp(
      String.raw`${NAO_NEGADO}${palavra(VERBOS_DE_ENTREGA)}\s+${ADVERBIO_OPC}${DETERMINANTE}${palavra(BENEFICIOS)}`,
      'iu',
    ),
    perguntaDesarma: false,
  },
  {
    // GARANTIA ELEITORAL — resultado prometido com certeza. "prometo que vou resolver",
    // "garanto que vou acabar com a fila", "pode ter certeza que vou asfaltar sua rua",
    // "resultado garantido". Visão ampla ("vou trabalhar pela saúde") não casa: falta o
    // verbo de resultado específico ou o marcador de garantia.
    categoria: 'garantia_eleitoral',
    padrao: new RegExp(
      [
        String.raw`${NAO_NEGADO}${palavra(MARCADOR_PROMESSA)}\s+que\s+(?:eu\s+|a\s+gente\s+|n[oó]s\s+)?(?:vou|vai|vamos|ir[eá]i?|iremos)?\s*(?:${VERBOS_DE_RESULTADO})`,
        String.raw`${palavra(MARCADOR_CERTEZA)}\s+(?:que\s+)?(?:eu\s+)?(?:vou|vamos|ir[eá]i?)\s+(?:${VERBOS_DE_RESULTADO})`,
        palavra(GARANTIA_LITERAL),
        // "vou acabar com a fila do SUS", "vou asfaltar sua rua" — promessa de obra como fato.
        String.raw`${NAO_NEGADO}vou\s+(?:acabar\s+com|asfaltar|construir|entregar|consertar|reformar)\s+${DETERMINANTE}[a-zç]`,
      ].join('|'),
      'iu',
    ),
    perguntaDesarma: false,
  },
];

/** Quebra em frases para que a `?` valha só para a frase em que está. Idem clínico. */
function frases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?\n])\s+/u)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

export function detectarPromessaDeCampanha(texto: string): AchadoDeCampanha {
  const achadas = new Set<CategoriaDeCampanha>();
  for (const frase of frases(texto)) {
    const pergunta = frase.endsWith('?');
    for (const regra of REGRAS) {
      if (!regra.padrao.test(frase)) continue;
      if (regra.perguntaDesarma && pergunta) continue;
      achadas.add(regra.categoria);
    }
  }
  const categorias = [...achadas];
  return { achou: categorias.length > 0, categorias };
}

const O_QUE_FAZER: Record<CategoriaDeCampanha, string> = {
  captacao_de_sufragio: 'nunca ligue voto ou apoio a um favor, benefício ou entrega — é captação ilícita de sufrágio',
  promessa_de_beneficio: 'não prometa conseguir vaga, auxílio, emprego, consulta nem qualquer benefício pessoal',
  garantia_eleitoral: 'não garanta resultado de campanha nem prometa obra como coisa certa',
};

/**
 * O erro de ensino que volta ao modelo. Diz O QUE foi barrado e O QUE escrever no lugar —
 * veto que só diz "não" faz o modelo tentar a mesma frase com outra palavra. Mesma
 * disciplina do `renderVetoDeAfirmacaoClinica`.
 */
export function renderVetoDePromessaDeCampanha(categorias: readonly CategoriaDeCampanha[]): string {
  const regras = categorias.map((c) => O_QUE_FAZER[c]).join('; ');
  return (
    `A mensagem não foi enviada: ela faz uma promessa de campanha (${regras}). ` +
    'Reescreva sem troca por voto, sem garantir benefício e sem prometer resultado: ' +
    'acolha o pedido, diga que vai ENCAMINHAR a demanda pelos canais do gabinete e ' +
    'explicar o andamento, sem prometer o desfecho. Se for urgente, abra um caso para a equipe.'
  );
}

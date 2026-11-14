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
  'cesta|cestas|' +
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
  // Futuro SINTÉTICO 1ª pessoa ("conseguirei/garantirei/darei sua vaga"): a forma
  // escrita que escapava — o detector antigo só via a perífrase "vou conseguir".
  String.raw`conseguirei|conseguiremos|arranjarei|arranjaremos|darei|daremos|garantirei|garantiremos|liberarei|liberaremos|providenciarei|providenciaremos|resolverei|resolveremos|assegurarei|asseguraremos|` +
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

/**
 * TERCEIRA PESSOA (14/nov): quem fala em nome do gabinete promete pela boca do
 * parlamentar — "o vereador vai conseguir sua vaga", "o gabinete garante seu auxílio",
 * "a gente vai arrumar um emprego pra você". O sujeito é fechado em quem REPRESENTA o
 * mandato. "Ele", "ela", "a equipe", "o prefeito", "o doutor" ficaram de fora de
 * propósito: no atendimento são quase sempre terceiros ("lá ela consegue o Bolsa
 * Família", "a equipe do CRAS libera a cesta") e barrar isso quebrava a rotina.
 */
const SUJEITO_DO_MANDATO =
  String.raw`vereador(?:a|es|as)?|deputad[oa]s?|senador(?:a|es|as)?|parlamentar(?:es)?|gabinete|mandato|nossa\s+equipe|nosso\s+time`;
const VERBOS_DE_ENTREGA_3P =
  String.raw`(?:vai|v[aã]o|ir[aá]|ir[aã]o)\s+(?:te\s+|lhe\s+)?(?:conseguir|arranjar|arrumar|dar|garantir|liberar|providenciar|resolver|assegurar)|` +
  String.raw`conseguir[aá]|arranjar[aá]|arrumar[aá]|dar[aá]|garantir[aá]|liberar[aá]|providenciar[aá]|resolver[aá]|assegurar[aá]|` +
  String.raw`(?:te\s+|lhe\s+)?(?:consegue|arranja|arruma|garante|libera|providencia|assegura)`;

/**
 * Momento do voto — o que transforma "lembra da gente" em pedido de retribuição.
 * "Outubro", "campanha" e "votação" NÃO entram: são palavras do dia a dia do gabinete
 * (mandato itinerante em outubro, campanha do agasalho, votação do projeto).
 */
const HORA_DO_VOTO = String.raw`elei[cç][aã]o|elei[cç][oõ]es|urna|urnas|(?:hora|dia)\s+de\s+votar|hora\s+do\s+voto`;

/** Voto que NÃO é o voto na urna: enquete, consulta pública, projeto em plenário. */
const VOTO_QUE_NAO_E_DE_URNA = String.raw`enquete|consulta|pesquisa|or[cç]amento|projeto|pr[eê]mio|concurso|plen[aá]rio|comiss[aã]o|favor[aá]vel`;

/** Perder o que já tem — a ameaça que o art. 41-A, § 2º, trata como captação. */
const PERDA = String.raw`perde|perdem|perder|perder[aá]|vai\s+perder|fica\s+sem|ficam\s+sem|ficar\s+sem|ficar[aá]\s+sem|vai\s+ficar\s+sem`;

/** "Não é possível", "ninguém pode": recusa, não oferta. */
const NAO_IMPEDIDO = String.raw`(?<!(?:n[aã]o\s+[eé]\s+poss[ií]vel|imposs[ií]vel|n[aã]o\s+d[aá]\s+(?:para|pra)|n[aã]o\s+pode(?:mos)?|ningu[eé]m\s+pode|n[aã]o\s+tem\s+como)\s+)`;

/** "Na frente" de quem: fim da oração, ou da fila/lista/dos outros. "Te passo na frente o contato" não é. */
const NA_FRENTE_DE_QUEM = String.raw`(?=\s*(?:[.!,;:]|$|d[ao]s?\s+(?:fila|lista|outros|demais)|n[ao]\s+(?:fila|lista)))`;

/** Qualquer negação na frase — desarma as regras de terceira pessoa e de fila (recusar não é prometer). */
const TEM_NEGACAO = new RegExp(String.raw`${INICIO}(?:n[aã]o|nem|nunca|jamais|ningu[eé]m)${FIM}`, 'iu');

const REGRAS: ReadonlyArray<{
  categoria: CategoriaDeCampanha;
  padrao: RegExp;
  perguntaDesarma: boolean;
  /** A regra não vale quando a frase traz uma negação, em qualquer lugar. */
  negacaoDesarma?: boolean;
}> = [
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
        // O [a-zç0-9] cobre o NÚMERO DE URNA ("vota no 15 que…"), forma mais comum.
        String.raw`${palavra(VOTO)}\s+(?:em\s+mim|n[oa]\s+[a-zç0-9]+|aqui)?\s*,?\s*que\s+(?:eu\s+)?(?:te\s+)?(?:${ENTREGA_CURTA})`,
        // "se você votar em mim, eu te arranjo…" — voto condicional + entrega até 40 chars.
        String.raw`(?:se\s+)?(?:voc[eê]|vc)\s+votar?\s+(?:em\s+mim|n[oa]\s+[a-zç0-9]+)[,\s].{0,40}?(?:${ENTREGA_CURTA})`,
        // "eu te dou um emprego se você votar…" — entrega + voto condicional até 40 chars.
        String.raw`(?:${ENTREGA_CURTA}).{0,40}?(?:se|caso)\s+(?:voc[eê]|vc)\s+votar`,
        // "vota no 15 E eu te arranjo o emprego" — voto seguido, por QUALQUER conectivo
        // curto (não só "que"/"se"), de uma entrega de BENEFÍCIO CONCRETO. Exigir o
        // benefício mantém o falso-positivo baixo (voto + verbo sozinhos não bastam).
        String.raw`${palavra(VOTO)}.{0,30}?(?:${ENTREGA_CURTA})\s+${ADVERBIO_OPC}${DETERMINANTE}${palavra(BENEFICIOS)}`,
        // RECIPROCIDADE — "lembra da gente na eleição", "não esqueça do vereador na hora de
        // votar", "conto com seu voto", "retribua nas urnas", "uma mão lava a outra".
        String.raw`(?:${palavra('lembr[ae]r?|lembrem')}(?:-se)?|n[aã]o\s+(?:se\s+)?${palavra('esque[cç][ae]m?')})\s+(?:de\s+mim|da\s+gente|de\s+n[oó]s|d[oa]s?\s+(?:vereador(?:a|es|as)?|deputad[oa]s?|senador(?:a|es|as)?|parlamentar(?:es)?|gabinete|mandato))${FIM}[^.!?\n]{0,40}?${palavra(HORA_DO_VOTO)}`,
        // "Conto com seu voto" — menos quando é o voto numa enquete, consulta ou projeto.
        String.raw`${palavra('conto|contamos|conta|contar')}\s+com\s+(?:o\s+)?(?:seu|teu|vosso)\s+(?:voto${FIM}(?![^.!?\n]{0,60}${palavra(VOTO_QUE_NAO_E_DE_URNA)})|apoio\s+n(?:a|as)\s+(?:urna|urnas|elei[cç][aã]o|elei[cç][oõ]es))`,
        String.raw`${palavra('retribu[a-zçã]+')}[^.!?\n]{0,30}?(?:${palavra('urna|urnas|votando')}|com\s+(?:o\s+)?(?:seu|teu)\s+voto${FIM})`,
        String.raw`uma\s+m[aã]o\s+lava\s+a\s+outra`,
        // AMEAÇA DE PERDA — "se não votar, perde o auxílio", "quem não apoiar fica sem a
        // cesta". A perda tem de ser de um BENEFÍCIO: "se não votar na enquete, perde a
        // chance de opinar" e "quem não votar fica sem tirar passaporte" são informação.
        String.raw`(?:se|quem|caso)\s+(?:voc[eê]s?\s+|vc\s+)?n[aã]o\s+(?:votar(?:em)?|apoiar(?:em)?|vier\s+com\s+a\s+gente)[^.!?\n]{0,50}?${palavra(PERDA)}\s+${DETERMINANTE}${palavra(BENEFICIOS)}`,
        String.raw`${palavra(PERDA)}\s+${DETERMINANTE}${palavra(BENEFICIOS)}[^.!?\n]{0,40}?(?:se|caso)\s+(?:voc[eê]s?\s+|vc\s+)?n[aã]o\s+(?:votar|apoiar)`,
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
      [
        String.raw`${NAO_NEGADO}${palavra(VERBOS_DE_ENTREGA)}\s+${ADVERBIO_OPC}${DETERMINANTE}${palavra(BENEFICIOS)}`,
        // "prometo sua vaga", "juro seu auxílio" — promessa CRUA de benefício, sem o
        // verbo de entrega. ("garanto" já cai pelo verbo de entrega.) A negação desarma.
        String.raw`${NAO_NEGADO}${palavra(MARCADOR_PROMESSA)}\s+${ADVERBIO_OPC}${DETERMINANTE}${palavra(BENEFICIOS)}`,
        // PASSAR NA FRENTE e ADIANTAR — só quando é sobre a PESSOA e na PRIMEIRA pessoa:
        // "te passo na frente", "coloco você na frente", "adianto sua cirurgia", "vamos
        // agilizar seu exame", "dou um jeitinho". "Para agilizar o atendimento, me informe…",
        // "idoso passa na frente por lei" e "dar um jeito nesse buraco" são rotina e passam.
        String.raw`${NAO_NEGADO}${NAO_IMPEDIDO}${palavra('te|lhe')}\s+${palavra('pass[a-z]+|coloc[a-z]+|bot[a-z]+|ponho')}\s+(?:l[aá]\s+)?na\s+frente${NA_FRENTE_DE_QUEM}`,
        String.raw`${NAO_NEGADO}${NAO_IMPEDIDO}${palavra('pass[a-z]+|coloc[a-z]+|bot[a-z]+|ponho')}\s+(?:voc[eê]|vc|o\s+senhor|a\s+senhora)\s+(?:l[aá]\s+)?na\s+frente${NA_FRENTE_DE_QUEM}`,
        String.raw`${NAO_NEGADO}${NAO_IMPEDIDO}${palavra(String.raw`adianto|adiantamos|agilizo|agilizamos|acelero|aceleramos|antecipo|antecipamos|(?:vou|vamos|a\s+gente\s+vai)\s+(?:adiantar|agilizar|acelerar|antecipar)`)}\s+(?:a\s+|o\s+)?(?:sua|seu|tua|teu)\s+${palavra('consulta|cirurgia|exame|exames|vaga|leito|benef[ií]cio|aposentadoria')}`,
        String.raw`${NAO_NEGADO}${NAO_IMPEDIDO}${palavra(String.raw`dou|damos|vou\s+dar|vamos\s+dar|a\s+gente\s+d[aá]`)}\s+(?:um|aquele)\s+jeitinho`,
      ].join('|'),
      'iu',
    ),
    perguntaDesarma: false,
  },
  {
    // TERCEIRA PESSOA — "o vereador vai conseguir sua vaga", "o gabinete garante seu
    // auxílio". Regra separada porque aqui PERGUNTA e NEGAÇÃO desarmam: "o gabinete garante
    // vaga? Não", "nem o vereador consegue vaga fora da fila" e "o vereador não promete que
    // vai conseguir a vaga" são a RECUSA da promessa, não a promessa.
    categoria: 'promessa_de_beneficio',
    padrao: new RegExp(
      String.raw`${palavra(SUJEITO_DO_MANDATO)}[^.!?\n]{0,45}?\s(?:${VERBOS_DE_ENTREGA_3P})\s+${ADVERBIO_OPC}${DETERMINANTE}${palavra(BENEFICIOS)}`,
      'iu',
    ),
    perguntaDesarma: true,
    negacaoDesarma: true,
  },
  {
    // FURAR FILA — vale em qualquer pessoa. "Ninguém fura a fila" e "furar a fila não é
    // correto" são recusa: a negação desarma.
    categoria: 'promessa_de_beneficio',
    padrao: new RegExp(String.raw`${palavra(String.raw`fur[a-zçã]+|pulo|pulamos|vou\s+pular|vamos\s+pular`)}\s+(?:a\s+)?fila${FIM}`, 'iu'),
    perguntaDesarma: true,
    negacaoDesarma: true,
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

/** Teto do que o detector lê. Mensagem de WhatsApp não chega perto; acima disso é só custo. */
export const TAMANHO_MAXIMO_ANALISADO = 8000;

/**
 * Prepara o texto: forma NFC (acento decomposto casa igual), espaços e tabs em sequência
 * viram UM espaço — uma regra antiga é cúbica em espaços, e 5 mil espaços depois de "vota"
 * travavam o processo por dezenas de segundos — e corte no teto.
 */
function normalizar(texto: string): string {
  return texto.slice(0, TAMANHO_MAXIMO_ANALISADO).normalize('NFC').replace(/[^\S\n]+/gu, ' ');
}

export function detectarPromessaDeCampanha(texto: string): AchadoDeCampanha {
  const achadas = new Set<CategoriaDeCampanha>();
  for (const frase of frases(normalizar(texto))) {
    const pergunta = frase.endsWith('?');
    let negada: boolean | null = null;
    for (const regra of REGRAS) {
      if (!regra.padrao.test(frase)) continue;
      if (regra.perguntaDesarma && pergunta) continue;
      if (regra.negacaoDesarma) {
        negada ??= TEM_NEGACAO.test(frase);
        if (negada) continue;
      }
      achadas.add(regra.categoria);
    }
  }
  const categorias = [...achadas];
  return { achou: categorias.length > 0, categorias };
}
const O_QUE_FAZER: Record<CategoriaDeCampanha, string> = {
  captacao_de_sufragio:
    'nunca ligue voto ou apoio a um favor, benefício ou entrega, não peça retribuição nas urnas e não ameace perda de benefício — é captação ilícita de sufrágio',
  promessa_de_beneficio:
    'não prometa (nem em nome do parlamentar ou do gabinete) conseguir vaga, auxílio, emprego, consulta nem qualquer benefício pessoal, e não ofereça furar fila ou adiantar atendimento',
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

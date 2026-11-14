/**
 * REDAÇÃO OFICIAL DO GABINETE — o padrão de escrita que a IA segue ao redigir.
 *
 * Extraído de documentos reais de um gabinete com 20 anos de prática (ofícios a
 * secretário e requerimentos de comissão, nov/2026). É o padrão do PRODUTO: vale
 * para qualquer gabinete; o que muda por cliente (cidade, nome da Casa, artigo do
 * regimento) entra como dado, nunca no texto fixo.
 *
 * Módulo PURO (só monta texto): a tela e o servidor dizem o mesmo, e dá para
 * testar sem chamar IA nenhuma.
 *
 * Três regras que valem para os três documentos:
 *  1. Nada inventado. Dado que falta vira lacuna entre colchetes, em maiúsculas
 *     — "[ENDEREÇO COMPLETO COM CEP]" — para quem revisa enxergar e preencher.
 *  2. Formal, objetivo, sem adjetivo de efeito nem apelo.
 *  3. O parlamentar intermedeia e pede providência; nunca promete resultado.
 */

export type DadosDoOficio = {
  /** Nome do cidadão que pediu; vazio = demanda do próprio gabinete. */
  demandante?: string | null;
  /** Bairro do cidadão, quando conhecido. */
  bairro?: string | null;
  assunto: string;
  /** Natureza da demanda (ex.: "poda de árvore"). */
  tipo?: string | null;
  /** Órgão de destino (ex.: "Secretaria Municipal de Governo"). */
  orgao?: string | null;
  /** Autoridade destinatária (nome e cargo), para o vocativo. */
  destinatario?: string | null;
  /** Cidade do gabinete. */
  cidade?: string | null;
  /** Local da ocorrência como vai no ofício (logradouro, número, referência, bairro, CEP). */
  local?: string | null;
  /** Número do protocolo já aberto no órgão. */
  protocolo?: string | null;
  /** O que foi registrado sobre o caso (relato, histórico), do mais antigo ao mais novo. */
  relatos?: readonly string[];
};

export type TipoDeRequerimento = "visita_tecnica" | "audiencia_publica";

export type DadosDoRequerimento = {
  tipo: TipoDeRequerimento;
  assunto: string;
  /** Local da visita (ponto de encontro) ou da audiência. */
  local?: string | null;
  /** Data e hora propostas, já por extenso (ex.: "24 de novembro de 2026, terça-feira, às 11 horas"). */
  quando?: string | null;
  /** Comissão a que se requer (ex.: "Comissão de Meio Ambiente, Defesa dos Animais e Política Urbana"). */
  comissao?: string | null;
  /** Dispositivo do regimento (ex.: "art. 48 do Regimento Interno"). Vazio = lacuna. */
  dispositivo?: string | null;
  /** Órgãos ou autoridades a convidar, quando já escolhidos. */
  convidados?: readonly string[];
  cidade?: string | null;
  relatos?: readonly string[];
};

const LACUNAS =
  "NUNCA invente dado: nome, endereço, CEP, número de protocolo, data, cargo ou órgão que não " +
  "esteja nas informações recebidas. O que faltar, escreva como lacuna entre colchetes e em " +
  "maiúsculas, no lugar exato onde o dado entraria (ex.: [ENDEREÇO COMPLETO COM CEP], " +
  "[Nº DO PROTOCOLO]). Se o protocolo não foi informado, omita a menção a protocolo.";

const TOM =
  "Tom formal, objetivo e respeitoso, em português do Brasil. Sem adjetivos de efeito, sem apelo " +
  "emocional, sem saudações exageradas. O parlamentar intermedeia e solicita providência; nunca " +
  "promete resultado, prazo ou atendimento. Devolva somente o texto do documento, sem título, " +
  "sem comentários e sem marcação (nada de asteriscos ou cerquilhas). Datas, horas e números em " +
  "algarismos, copiados exatamente como recebidos — nunca por extenso.";

/** Instruções fixas do OFÍCIO a órgão ou autoridade. */
export const PADRAO_DO_OFICIO =
  "Você redige ofícios de gabinete parlamentar no Brasil, dirigidos a autoridades e órgãos " +
  "públicos, no padrão de uma assessoria experiente. Escreva em primeira pessoa do parlamentar. " +
  "Siga EXATAMENTE esta estrutura, um bloco por parágrafo, com uma linha em branco entre eles:\n" +
  "1) VOCATIVO, sozinho na linha, com vírgula, no gênero da autoridade (ex.: 'Senhor Secretário,' " +
  "ou 'Senhora Secretária,'). Deduza o gênero do nome e do cargo informados; se a autoridade não " +
  "foi informada ou o gênero é incerto, use 'Prezado(a) Senhor(a),'.\n" +
  "2) ABERTURA: 'Cumprimentando-o respeitosamente, informo que o senhor [nome], morador do Bairro " +
  "[bairro], solicitou minha intermediação junto à [ente responsável, ex.: Prefeitura de <cidade>] " +
  "para o atendimento da seguinte demanda de interesse público:'. Ajuste 'o/a', 'senhor/senhora' e " +
  "'morador/moradora' ao gênero de cada pessoa. Se não há cidadão demandante, abra com " +
  "'Cumprimentando-o respeitosamente, apresento a Vossa Senhoria a seguinte demanda de interesse público:'.\n" +
  "3) O PEDIDO em UMA linha iniciada por '• ', como frase nominal: 'Solicitação de [serviço] " +
  "[localização completa: logradouro, número, referência, bairro, CEP].'\n" +
  "4) JUSTIFICATIVA: 'A solicitação justifica-se pelo fato de …' — o fato observado, o risco e " +
  "quem é afetado. Se houver número de protocolo, cite aqui ('registrada sob o Protocolo nº …').\n" +
  "5) PROVIDÊNCIA: 'Diante do exposto, solicito a adoção das providências necessárias para …' — " +
  "peça vistoria técnica e, constatada a necessidade, a execução do serviço. Peça urgência apenas " +
  "quando houver risco à integridade de pessoas.\n" +
  "6) FECHO, literal: 'Aproveito a oportunidade para renovar protestos de estima e consideração, " +
  "colocando o meu gabinete à disposição para esclarecimentos que se façam necessários.'\n" +
  "7) Última linha, sozinha: 'Respeitosamente,'\n" +
  "NÃO escreva número do ofício, local e data, assinatura nem o bloco do destinatário: o sistema " +
  "já os coloca no documento. " +
  LACUNAS +
  " " +
  TOM;

/** Instruções fixas do REQUERIMENTO DE COMISSÃO (visita técnica ou audiência pública). */
export const PADRAO_DO_REQUERIMENTO =
  "Você redige requerimentos de comissão de Casa Legislativa no Brasil, no padrão de uma " +
  "assessoria experiente. Só o verbo 'Requeiro' vem em primeira pessoa; o restante é impessoal " +
  "('propõe-se', 'sugere-se', 'solicita-se'). Um bloco por parágrafo, com uma linha em branco " +
  "entre eles. " +
  "NÃO escreva número do requerimento (é dado pela Casa no protocolo), assinatura nem o bloco do " +
  "destinatário. Termine o texto no último parágrafo de conteúdo. " +
  LACUNAS +
  " " +
  TOM;

const ESTRUTURA_DA_VISITA =
  "Estrutura (visita técnica):\n" +
  "1) 'Senhor Presidente,' (ou 'Senhora Presidente,' se a presidência da comissão for informada e for mulher).\n" +
  "2) 'Requeiro a esta Comissão, nos termos do [dispositivo], a realização de visita técnica, com " +
  "ponto de encontro na [logradouro, número, bairro, CEP], com a finalidade de avaliar [objetivo técnico].'\n" +
  "3) 'A solicitação justifica-se pela …' — fato, risco e quem é afetado.\n" +
  "4) 'Propõe-se que a visita técnica seja realizada no dia [data e hora propostas, exatamente como recebidas].'\n" +
  "5) 'Para subsidiar a análise da demanda, sugere-se convidar representantes dos seguintes órgãos:' " +
  "seguido de uma linha por órgão, iniciada por '• ', no formato 'Nome por extenso – SIGLA;'. Use os " +
  "órgãos informados; se nenhum foi informado, escreva uma única linha '• [ÓRGÃOS A CONVIDAR]'.\n" +
  "6) 'Ao término da visita, solicita-se manifestação técnica dos órgãos competentes quanto à …' — " +
  "a viabilidade ou as medidas cabíveis.";

const ESTRUTURA_DA_AUDIENCIA =
  "Estrutura (audiência pública):\n" +
  "1) 'Senhor Presidente,' (ou 'Senhora Presidente,' se a presidência da comissão for informada e for mulher).\n" +
  "2) 'Requeiro a esta [nome da comissão], nos termos do [dispositivo], a realização de audiência " +
  "pública no dia [data e hora propostas, exatamente como recebidas], no [local], com a finalidade de " +
  "debater [tema e alcance].'\n" +
  "3) 'A realização da audiência justifica-se pela necessidade de …' — um ou dois parágrafos.\n" +
  "4) 'Para assegurar a participação dos diferentes segmentos envolvidos e proporcionar um debate " +
  "abrangente, sugere-se que sejam convidados representantes das seguintes autoridades e " +
  "instituições:' seguido de uma linha por convidado, iniciada por '• ' (nome, cargo e instituição, " +
  "como informados). Se nenhum foi informado, uma única linha '• [AUTORIDADES E INSTITUIÇÕES A CONVIDAR]'.\n" +
  "5) 'Para o aprofundamento do debate, sugere-se que os convidados apresentem suas perspectivas sobre …'.\n" +
  "6) Pedido de nota técnica: 'Para subsidiar a referida audiência pública, solicito à consultoria " +
  "legislativa da Casa que elabore nota técnica sobre o assunto, abordando …'.";

function linha(rotulo: string, valor: string | null | undefined): string {
  const v = (valor ?? "").trim();
  return v ? `${rotulo}: ${v}\n` : "";
}

/** Relatos como lista numerada, cortados para não estourar o pedido. */
function blocoDeRelatos(relatos: readonly string[] | undefined): string {
  const limpos = (relatos ?? [])
    .map((r) => r.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(-8)
    .map((r, i) => `${i + 1}. ${r.slice(0, 600)}`);
  if (limpos.length === 0) return "";
  return `O que o gabinete registrou sobre o caso (use como fonte dos fatos; não copie literalmente):\n${limpos.join("\n")}\n`;
}

/** O pedido do ofício: os dados do caso, um por linha. */
export function montarPedidoDoOficio(d: DadosDoOficio): string {
  const demandante = (d.demandante ?? "").trim();
  return (
    "Redija o ofício com estes dados.\n\n" +
    (demandante ? `Cidadão demandante: ${demandante}\n` : "Cidadão demandante: (nenhum — demanda do próprio gabinete)\n") +
    linha("Bairro do cidadão", d.bairro) +
    linha("Assunto", d.assunto) +
    linha("Natureza", d.tipo) +
    linha("Órgão de destino", d.orgao) +
    linha("Autoridade destinatária (para o vocativo)", d.destinatario) +
    linha("Cidade do gabinete", d.cidade) +
    linha("Local da ocorrência (copie exatamente)", d.local) +
    linha("Protocolo já aberto no órgão (copie exatamente)", d.protocolo) +
    blocoDeRelatos(d.relatos)
  );
}

/** As instruções do requerimento: o padrão comum + a estrutura do tipo pedido. */
export function instrucoesDoRequerimento(tipo: TipoDeRequerimento): string {
  return `${PADRAO_DO_REQUERIMENTO}\n\n${tipo === "audiencia_publica" ? ESTRUTURA_DA_AUDIENCIA : ESTRUTURA_DA_VISITA}`;
}

/** O pedido do requerimento: os dados do caso, um por linha. */
export function montarPedidoDoRequerimento(d: DadosDoRequerimento): string {
  const convidados = (d.convidados ?? []).map((c) => c.trim()).filter(Boolean);
  return (
    `Redija o requerimento de ${d.tipo === "audiencia_publica" ? "audiência pública" : "visita técnica"} com estes dados.\n\n` +
    linha("Assunto", d.assunto) +
    linha(d.tipo === "audiencia_publica" ? "Local da audiência" : "Ponto de encontro", d.local) +
    linha("Data e hora propostas", d.quando) +
    linha("Comissão", d.comissao) +
    linha("Dispositivo do regimento", d.dispositivo) +
    linha("Cidade", d.cidade) +
    (convidados.length ? `Convidados:\n${convidados.map((c) => `- ${c}`).join("\n")}\n` : "") +
    blocoDeRelatos(d.relatos)
  );
}

/**
 * Data e hora como a praxe escreve: "24 de novembro de 2026, terça-feira, às 11
 * horas" / "04 de novembro de 2026, quarta-feira, às 10h30". Horário de Brasília.
 */
export function dataDaPraxe(d: Date): string {
  const fuso = "America/Sao_Paulo";
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: fuso });
  const semana = d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: fuso });
  const [h, m] = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: fuso }).split(":");
  const hora = m === "00" ? `${Number(h)} horas` : `${Number(h)}h${m}`;
  return `${dia}, ${semana}, às ${hora}`;
}

/**
 * Limpa o que a IA devolve: tira marcação (**negrito**, # título), normaliza os
 * marcadores para "• " e garante uma linha em branco entre blocos. O PDF do
 * ofício imprime texto puro — asterisco sairia como asterisco.
 */
export function limparTextoOficial(texto: string): string {
  return texto
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(/^\s*[-*–]\s+/, "• ")
        .replace(/^\s*•\s*/, "• ")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTOS DA CASA além do requerimento de comissão (indicação, pedido de
// informação, moção…). O NOME muda de Casa para Casa — por isso a IA recebe o
// rótulo que o gabinete usa e escolhe o verbo por ele. Nenhum artigo, cota ou
// prazo de uma Casa específica está escrito aqui.
// ─────────────────────────────────────────────────────────────────────────────

export type FuncaoDoDocumentoDaCasa = "pedido_comissao" | "providencia" | "informacao" | "manifestacao" | "homenagem";

export type DadosDoDocumentoDaCasa = {
  funcao: FuncaoDoDocumentoDaCasa;
  /** O nome que ESTE gabinete dá ao documento (ex.: "Indicação", "Requerimento"). */
  rotulo: string;
  /** Em pedido a comissão: "visita_tecnica", "audiencia_publica" ou outro texto. */
  subtipo?: string | null;
  assunto: string;
  /** A quem se pede: comissão, órgão ou autoridade. */
  destinatario?: string | null;
  /** Dispositivo do regimento, como o gabinete escreve. Vazio = lacuna. */
  dispositivo?: string | null;
  local?: string | null;
  quando?: string | null;
  /** Só em homenagem: a data da cerimônia, já por extenso. */
  cerimonia?: string | null;
  cidade?: string | null;
  /** O que a equipe escreveu de próprio punho para orientar a redação. */
  orientacao?: string | null;
  relatos?: readonly string[];
};

const PADRAO_DA_CASA =
  "Você redige documentos que um parlamentar apresenta à sua Casa Legislativa no Brasil, no padrão de " +
  "uma assessoria experiente. O nome do documento muda de uma Casa para outra: use o nome informado e " +
  "o verbo que corresponde a ele — 'Indico' para indicação, 'Requeiro' para requerimento ou pedido de " +
  "informação, 'Proponho' para moção, voto ou homenagem. Só esse verbo vem em primeira pessoa; o restante é " +
  "impessoal ('solicita-se', 'sugere-se'). Um bloco por parágrafo, com uma linha em branco entre eles. " +
  "NÃO escreva número do documento (é dado pela Casa no protocolo), local e data, assinatura nem o bloco " +
  "do destinatário: o sistema já os coloca. Termine no último parágrafo de conteúdo. " +
  LACUNAS +
  " " +
  TOM;

const ESTRUTURA_DA_PROVIDENCIA =
  "Estrutura (pedido de providência ao Poder Executivo, por meio da Casa):\n" +
  "1) 'Senhor Presidente,' sozinho na linha.\n" +
  "2) O pedido, em um parágrafo: '[Verbo], nos termos do [dispositivo], ao [autoridade ou órgão " +
  "destinatário], a [obra, serviço ou medida], na [localização completa: logradouro, número, " +
  "referência, bairro].' Se o destinatário não foi informado, use '[AUTORIDADE OU ÓRGÃO DESTINATÁRIO]'.\n" +
  "3) 'JUSTIFICATIVA' sozinha na linha, e em seguida um ou dois parágrafos: o fato observado, o " +
  "risco e quem é afetado. Sem prometer atendimento nem prazo.";

const ESTRUTURA_DA_INFORMACAO =
  "Estrutura (pedido de informação a autoridade):\n" +
  "1) 'Senhor Presidente,' sozinho na linha.\n" +
  "2) 'Requeiro, nos termos do [dispositivo], que seja solicitado ao [autoridade ou órgão " +
  "destinatário] o envio das seguintes informações sobre [assunto]:'.\n" +
  "3) As perguntas, uma por linha, cada linha iniciada por '• ', objetivas e respondíveis com dado " +
  "ou documento (o quê, quanto, quando, quem responde, cópia de qual documento). De três a seis.\n" +
  "4) 'A solicitação justifica-se pela …' — por que a informação é necessária ao exercício da " +
  "fiscalização parlamentar.";

const ESTRUTURA_DA_MANIFESTACAO =
  "Estrutura (manifestação da Casa: aplauso, congratulação, pesar, apoio ou protesto):\n" +
  "1) 'Senhor Presidente,' sozinho na linha.\n" +
  "2) '[Verbo], nos termos do [dispositivo], [o tipo de manifestação, deduzido do assunto: voto de " +
  "aplauso, de pesar, moção de apoio, de protesto] a [pessoa ou entidade homenageada ou destinatária], " +
  "por [motivo, em uma frase].'\n" +
  "3) Um parágrafo com os fatos que justificam a manifestação — só os informados; nada de biografia " +
  "inventada.\n" +
  "4) 'Requer-se que desta manifestação seja dada ciência a [destinatário].' Se o destinatário não foi " +
  "informado, use '[A QUEM DAR CIÊNCIA]'.";

const ESTRUTURA_DA_HOMENAGEM =
  "Estrutura (proposta de homenagem da Casa a pessoa ou entidade):\n" +
  "1) 'Senhor Presidente,' sozinho na linha.\n" +
  "2) '[Verbo], nos termos do [dispositivo], a concessão de [honraria informada] a [homenageado].' Se a " +
  "honraria não foi informada, use '[HONRARIA]'.\n" +
  "3) 'JUSTIFICATIVA' sozinha na linha, e em seguida um ou dois parágrafos com os fatos que justificam a " +
  "homenagem — SOMENTE os informados. Não invente biografia, cargos, datas, prêmios nem números; o que " +
  "faltar para sustentar a homenagem vira lacuna, como '[TRAJETÓRIA E SERVIÇOS PRESTADOS]'.\n" +
  "4) Se a data da cerimônia foi informada: 'Propõe-se que a entrega ocorra em [data, exatamente como recebida].'";

const ESTRUTURA_DE_COMISSAO_GERAL =
  "Estrutura (pedido a uma comissão da Casa):\n" +
  "1) 'Senhor Presidente,' sozinho na linha.\n" +
  "2) 'Requeiro a esta [comissão], nos termos do [dispositivo], [a providência pedida], com a " +
  "finalidade de [objetivo].'\n" +
  "3) 'A solicitação justifica-se pela …' — fato, risco e quem é afetado.\n" +
  "4) Se houver data, local ou convidados informados, um parágrafo para cada.";

/** As instruções da IA para um documento da Casa, pela FUNÇÃO (o nome local entra no pedido). */
export function instrucoesDoDocumentoDaCasa(funcao: FuncaoDoDocumentoDaCasa, subtipo?: string | null): string {
  if (funcao === "pedido_comissao") {
    if (subtipo === "visita_tecnica" || subtipo === "audiencia_publica") return instrucoesDoRequerimento(subtipo);
    return `${PADRAO_DO_REQUERIMENTO}\n\n${ESTRUTURA_DE_COMISSAO_GERAL}`;
  }
  const estrutura =
    funcao === "providencia"
      ? ESTRUTURA_DA_PROVIDENCIA
      : funcao === "informacao"
        ? ESTRUTURA_DA_INFORMACAO
        : funcao === "homenagem"
          ? ESTRUTURA_DA_HOMENAGEM
          : ESTRUTURA_DA_MANIFESTACAO;
  return `${PADRAO_DA_CASA}\n\n${estrutura}`;
}

/** O pedido de um documento da Casa: os dados do caso, um por linha. */
export function montarPedidoDoDocumentoDaCasa(d: DadosDoDocumentoDaCasa): string {
  if (d.funcao === "pedido_comissao" && (d.subtipo === "visita_tecnica" || d.subtipo === "audiencia_publica")) {
    return (
      montarPedidoDoRequerimento({
        tipo: d.subtipo,
        assunto: d.assunto,
        local: d.local,
        quando: d.quando,
        comissao: d.destinatario,
        dispositivo: d.dispositivo,
        cidade: d.cidade,
        relatos: d.relatos,
      }) + linha("Orientação da equipe (siga, sem copiar literalmente)", d.orientacao)
    );
  }
  return (
    "Redija o documento com estes dados.\n\n" +
    linha("Nome do documento nesta Casa", d.rotulo) +
    linha("Assunto", d.assunto) +
    linha(d.funcao === "pedido_comissao" ? "Comissão" : "Destinatário (autoridade, órgão ou homenageado)", d.destinatario) +
    (d.funcao === "pedido_comissao" ? linha("Providência pedida à comissão", d.subtipo) : "") +
    (d.funcao === "homenagem" ? linha("Honraria", d.subtipo) : "") +
    linha("Dispositivo do regimento", d.dispositivo) +
    (d.funcao === "homenagem"
      ? linha("Data da cerimônia (copie exatamente)", d.cerimonia)
      : linha("Local (copie exatamente)", d.local) + linha("Data e hora propostas", d.quando)) +
    linha("Cidade", d.cidade) +
    linha("Orientação da equipe (siga, sem copiar literalmente)", d.orientacao) +
    blocoDeRelatos(d.relatos)
  );
}

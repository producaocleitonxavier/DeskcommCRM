/**
 * ROTEIRO FALADO da Voz do Mandato — o texto que o clone do político "diz" em
 * cada momento do gabinete. Curto, caloroso e em 1ª pessoa (o político fala), ao
 * contrário do texto formal do WhatsApp (que é institucional). NÃO envia nada;
 * só monta a string que vai pro TTS.
 *
 * AVISO DE IA (TSE 23.755/2026): por padrão incluímos uma frase curta falada no
 * FIM dizendo que o áudio foi gerado com apoio de IA. É a trava honesta contra a
 * acusação de "deepfake/engano" e protege o mandato. Em período eleitoral é
 * OBRIGATÓRIO; fora dele é prudente — por isso fica ligado por padrão e quem
 * chama pode desligar explicitamente (Fase B, quando houver a regra por período).
 */

export type MomentoVoz = "resolucao" | "encaminhamento";

export const AVISO_IA_FALADO =
  "Ah, este áudio foi gerado com apoio de inteligência artificial, com a minha voz e a minha autorização.";

/** Acrescenta o aviso de IA falado ao fim de um texto livre (recado avulso).
 * Guardrail TSE 23.755/2026 — centralizado pra viajar junto do componente. */
export function comAvisoIA(texto: string, incluir = true): string {
  const t = texto.trim();
  if (!incluir || !t) return t;
  return `${t} ${AVISO_IA_FALADO}`;
}

export interface OpcoesRecado {
  momento: MomentoVoz;
  primeiroNome: string | null;
  /** Nome do político que fala (de `pol_gabinete_config`). Sem ele, o recado
   * não inventa nome — só não se apresenta. NUNCA chumbe um nome aqui. */
  nomeParlamentar?: string | null;
  /** Nome/assunto curto do pedido, opcional (deixa o recado mais pessoal). */
  assuntoCurto?: string | null;
  incluirAvisoIA?: boolean;
}

function saudacao(primeiroNome: string | null): string {
  const n = (primeiroNome ?? "").trim();
  return n ? `Olá, ${n}!` : "Olá!";
}

/** Monta o roteiro falado do recado. Sempre termina com um fecho caloroso e,
 * por padrão, com o aviso de IA. */
export function scriptRecado(opts: OpcoesRecado): string {
  const ini = saudacao(opts.primeiroNome);
  const assunto = (opts.assuntoCurto ?? "").trim();
  const sobre = assunto ? ` sobre ${assunto}` : "";
  // Apresentação parametrizada: "Aqui é <nome>." Sem nome configurado, o áudio
  // simplesmente não se apresenta (jamais inventa um nome).
  const nome = (opts.nomeParlamentar ?? "").trim();
  const intro = nome ? `Aqui é ${nome}. ` : "";

  let corpo: string;
  if (opts.momento === "resolucao") {
    corpo =
      `${ini} ${intro}` +
      `Passando pra te dar uma boa notícia: o seu pedido${sobre} foi resolvido. ` +
      `Agradeço muito a sua confiança, e conte sempre com o nosso gabinete. Um grande abraço!`;
  } else {
    corpo =
      `${ini} ${intro}` +
      `Passando pra te avisar que o seu pedido${sobre} já foi encaminhado pro órgão responsável. ` +
      `Assim que tiver novidade, eu te retorno. Pode contar comigo e com o nosso gabinete. Um abraço!`;
  }

  const incluirAviso = opts.incluirAvisoIA !== false;
  return incluirAviso ? `${corpo} ${AVISO_IA_FALADO}` : corpo;
}

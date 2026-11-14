/**
 * DOCUMENTOS DO GABINETE PARA A CASA — regras puras.
 *
 * O mesmo pedido muda de nome de uma Casa para outra: pedir um tapa-buraco é
 * "indicação" em Contagem, "requerimento" em Fortaleza e ofício em Belo Horizonte
 * (varredura de 14/nov/2026). Por isso o sistema guarda a FUNÇÃO do documento —
 * que é fixa e pequena — separada do RÓTULO, que é o nome que cada gabinete usa
 * e é texto livre. Nenhuma regra de uma Casa (comissões, artigo, cota, prazo)
 * mora aqui como fixa: tudo isso é campo de digitar.
 *
 * Cada gabinete LIGA os tipos que usa (`organizations.settings.gabinete.documentos`).
 * O que está desligado não aparece na tela.
 */

export const FUNCOES = ["pedido_comissao", "providencia", "informacao", "manifestacao"] as const;
export type FuncaoDoDocumento = (typeof FUNCOES)[number];

export const SITUACOES = ["rascunho", "protocolado", "aprovado", "realizado", "respondido", "arquivado"] as const;
export type SituacaoDoDocumento = (typeof SITUACOES)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoDoDocumento, string> = {
  rascunho: "Rascunho",
  protocolado: "Protocolado",
  aprovado: "Aprovado",
  realizado: "Realizado",
  respondido: "Respondido",
  arquivado: "Arquivado",
};

/** O que cada função é, em português simples — aparece na tela de escolher os tipos. */
export const DESCRICAO_DA_FUNCAO: Record<FuncaoDoDocumento, { nome: string; paraQue: string; exemplos: string }> = {
  pedido_comissao: {
    nome: "Pedido a uma comissão",
    paraQue: "Pede a uma comissão da Casa uma visita técnica, uma audiência pública ou outra providência dela.",
    exemplos: "Requerimento de comissão",
  },
  providencia: {
    nome: "Pedido de providência ao Executivo",
    paraQue: "Pede à Prefeitura ou ao Governo uma obra, um serviço ou uma medida, por meio da Casa.",
    exemplos: "Indicação · Requerimento",
  },
  informacao: {
    nome: "Pedido de informação",
    paraQue: "Pede informação oficial a uma autoridade. Em muitas Casas tem prazo de resposta.",
    exemplos: "Pedido de informação · Requerimento de informação",
  },
  manifestacao: {
    nome: "Manifestação ou homenagem",
    paraQue: "Registra aplauso, pesar, apoio ou protesto em nome da Casa.",
    exemplos: "Moção · Voto de pesar · Voto de aplauso",
  },
};

/** Os subtipos sugeridos de um pedido a comissão (o campo aceita outro texto). */
export const SUBTIPOS_DE_COMISSAO = [
  { valor: "visita_tecnica", rotulo: "Visita técnica" },
  { valor: "audiencia_publica", rotulo: "Audiência pública" },
] as const;

export type TipoDeDocumento = {
  funcao: FuncaoDoDocumento;
  /** O nome que ESTE gabinete usa (ex.: "Indicação", "Requerimento de comissão"). */
  rotulo: string;
  ligado: boolean;
};

/**
 * Três jeitos de trabalhar encontrados nas Casas brasileiras. Servem só para o
 * gabinete não começar do zero: escolhido um, tudo continua editável.
 */
export const MODELOS_DE_CASA = {
  comissao: {
    nome: "Requerimento de comissão é o dia a dia",
    onde: "Como em Belo Horizonte e na Assembleia de Minas",
    tipos: [
      { funcao: "pedido_comissao", rotulo: "Requerimento de comissão", ligado: true },
      { funcao: "providencia", rotulo: "Indicação", ligado: false },
      { funcao: "informacao", rotulo: "Pedido de informação", ligado: false },
      { funcao: "manifestacao", rotulo: "Moção", ligado: false },
    ],
  },
  indicacao: {
    nome: "Indicação é o dia a dia",
    onde: "Como em Contagem",
    tipos: [
      { funcao: "providencia", rotulo: "Indicação", ligado: true },
      { funcao: "manifestacao", rotulo: "Moção", ligado: true },
      { funcao: "informacao", rotulo: "Requerimento de informação", ligado: true },
      { funcao: "pedido_comissao", rotulo: "Requerimento de comissão", ligado: false },
    ],
  },
  requerimento: {
    nome: "Requerimento é o dia a dia",
    onde: "Como em Fortaleza, Natal e João Pessoa",
    tipos: [
      { funcao: "providencia", rotulo: "Requerimento", ligado: true },
      { funcao: "informacao", rotulo: "Requerimento de informação", ligado: true },
      { funcao: "manifestacao", rotulo: "Requerimento de votos", ligado: true },
      { funcao: "pedido_comissao", rotulo: "Requerimento de comissão", ligado: false },
    ],
  },
} as const satisfies Record<string, { nome: string; onde: string; tipos: readonly TipoDeDocumento[] }>;

export type ModeloDeCasa = keyof typeof MODELOS_DE_CASA;

/** O que vale para um gabinete que nunca escolheu nada. */
export const TIPOS_PADRAO: readonly TipoDeDocumento[] = MODELOS_DE_CASA.comissao.tipos;

export const TAMANHO_MAXIMO_DO_ROTULO = 60;

function ehFuncao(v: unknown): v is FuncaoDoDocumento {
  return typeof v === "string" && (FUNCOES as readonly string[]).includes(v);
}

export function ehSituacao(v: unknown): v is SituacaoDoDocumento {
  return typeof v === "string" && (SITUACOES as readonly string[]).includes(v);
}

/** Um rótulo digitado pelo gabinete: uma linha só, sem excesso, com teto. */
export function limparRotulo(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, TAMANHO_MAXIMO_DO_ROTULO) : "";
}

/**
 * Normaliza uma lista de tipos vinda de qualquer lugar (configuração guardada ou
 * formulário): sempre devolve as QUATRO funções, uma vez cada, na ordem recebida;
 * o que faltar entra desligado com o rótulo padrão; rótulo vazio volta ao padrão.
 */
export function normalizarTipos(entrada: unknown): TipoDeDocumento[] {
  const padrao = new Map(TIPOS_PADRAO.map((t) => [t.funcao, t]));
  const saida: TipoDeDocumento[] = [];
  const vistos = new Set<FuncaoDoDocumento>();
  if (Array.isArray(entrada)) {
    for (const item of entrada) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (!ehFuncao(o.funcao) || vistos.has(o.funcao)) continue;
      vistos.add(o.funcao);
      saida.push({ funcao: o.funcao, rotulo: limparRotulo(o.rotulo) || padrao.get(o.funcao)!.rotulo, ligado: o.ligado === true });
    }
  }
  for (const f of FUNCOES) {
    if (!vistos.has(f)) saida.push({ ...padrao.get(f)!, ligado: Array.isArray(entrada) ? false : padrao.get(f)!.ligado });
  }
  return saida;
}

/** Lê `settings.gabinete.documentos.tipos`; sem configuração, vale o padrão. */
export function tiposDeSettings(settings: unknown): TipoDeDocumento[] {
  if (!settings || typeof settings !== "object") return normalizarTipos(undefined);
  const gabinete = (settings as Record<string, unknown>).gabinete;
  if (!gabinete || typeof gabinete !== "object") return normalizarTipos(undefined);
  const documentos = (gabinete as Record<string, unknown>).documentos;
  if (!documentos || typeof documentos !== "object") return normalizarTipos(undefined);
  const tipos = (documentos as Record<string, unknown>).tipos;
  return normalizarTipos(Array.isArray(tipos) ? tipos : undefined);
}

/** Só os tipos ligados — é o que a tela oferece em "Novo documento". */
export function tiposLigados(tipos: readonly TipoDeDocumento[]): TipoDeDocumento[] {
  return tipos.filter((t) => t.ligado);
}

/** As situações que fazem sentido para cada função (a ordem é a do caminho natural). */
export function situacoesDaFuncao(funcao: FuncaoDoDocumento): SituacaoDoDocumento[] {
  if (funcao === "pedido_comissao") return ["rascunho", "protocolado", "aprovado", "realizado", "arquivado"];
  if (funcao === "informacao") return ["rascunho", "protocolado", "aprovado", "respondido", "arquivado"];
  if (funcao === "providencia") return ["rascunho", "protocolado", "aprovado", "respondido", "arquivado"];
  return ["rascunho", "protocolado", "aprovado", "arquivado"];
}

export const TAMANHO_MAXIMO_DO_DOCUMENTO = 12000;

export type DocumentoParaSalvar = {
  funcao: FuncaoDoDocumento;
  rotulo: string;
  subtipo: string | null;
  assunto: string;
  destinatario: string | null;
  dispositivo: string | null;
  corpo: string;
  numero: string | null;
  situacao: SituacaoDoDocumento;
  protocolado_em: string | null;
  prazo_em: string | null;
};

const curto = (v: unknown, teto: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, teto) : "");
/** Data AAAA-MM-DD que EXISTE no calendário (31/02 não passa: o motor do JS aceitaria e o banco recusaria). */
function data(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/**
 * Confere e limpa o que veio do formulário. Devolve o documento pronto para
 * gravar, ou a frase (em português simples) do que está errado.
 */
export function prepararDocumento(
  entrada: unknown,
  tipos: readonly TipoDeDocumento[],
  /** Na EDIÇÃO: a situação que o documento tem hoje. Ausente = documento novo. */
  situacaoAtual?: SituacaoDoDocumento,
): { ok: true; doc: DocumentoParaSalvar } | { ok: false; erro: string } {
  if (!entrada || typeof entrada !== "object") return { ok: false, erro: "Dados do documento inválidos." };
  const e = entrada as Record<string, unknown>;
  if (!ehFuncao(e.funcao)) return { ok: false, erro: "Escolha o tipo do documento." };
  const tipo = tipos.find((t) => t.funcao === e.funcao);
  if (!tipo?.ligado) return { ok: false, erro: "Este tipo de documento está desligado neste gabinete." };
  const assunto = curto(e.assunto, 300);
  if (!assunto) return { ok: false, erro: "Escreva o assunto do documento." };
  const corpo = typeof e.corpo === "string" ? e.corpo.replace(/\r\n/g, "\n").trim() : "";
  if (corpo.length > TAMANHO_MAXIMO_DO_DOCUMENTO) {
    return { ok: false, erro: `O texto está longo demais (máximo de ${TAMANHO_MAXIMO_DO_DOCUMENTO} letras).` };
  }
  let situacao: SituacaoDoDocumento = situacaoAtual ?? "rascunho";
  if (e.situacao !== undefined && e.situacao !== null && e.situacao !== "") {
    if (!ehSituacao(e.situacao) || !situacoesDaFuncao(e.funcao).includes(e.situacao)) {
      return { ok: false, erro: "Situação inválida para este tipo de documento." };
    }
    situacao = e.situacao;
  }
  // Documento que já saiu de rascunho é registro do mandato: não volta (senão dava para apagá-lo).
  if (situacaoAtual && situacaoAtual !== "rascunho" && situacao === "rascunho") {
    return { ok: false, erro: "Documento já protocolado não volta a rascunho. Se não vale mais, arquive." };
  }
  return {
    ok: true,
    doc: {
      funcao: e.funcao,
      // O rótulo é o do gabinete NA HORA em que o documento nasce: renomear o tipo depois não reescreve os antigos.
      rotulo: tipo.rotulo,
      subtipo: e.funcao === "pedido_comissao" ? curto(e.subtipo, 60) || null : null,
      assunto,
      destinatario: curto(e.destinatario, 300) || null,
      dispositivo: curto(e.dispositivo, 200) || null,
      corpo,
      numero: curto(e.numero, 60) || null,
      situacao,
      protocolado_em: data(e.protocolado_em),
      prazo_em: data(e.prazo_em),
    },
  };
}

/** O título que vai no alto do PDF: o nome que o gabinete dá ao documento, em maiúsculas. */
export function tituloDoDocumento(rotulo: string, subtipo: string | null): string {
  const sub = SUBTIPOS_DE_COMISSAO.find((s) => s.valor === subtipo);
  if (sub) return `REQUERIMENTO DE ${sub.rotulo.toUpperCase()}`;
  return (limparRotulo(rotulo) || "Documento").toUpperCase();
}

/** Quantos dias faltam para o prazo (negativo = vencido); `null` sem prazo ou já encerrado. */
export function diasParaOPrazo(prazoEm: string | null, situacao: SituacaoDoDocumento, hoje: Date = new Date()): number | null {
  if (!prazoEm || situacao === "respondido" || situacao === "realizado" || situacao === "arquivado") return null;
  const alvo = Date.parse(`${prazoEm}T00:00:00-03:00`);
  if (Number.isNaN(alvo)) return null;
  const hojeBr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(hoje);
  const inicio = Date.parse(`${hojeBr}T00:00:00-03:00`);
  return Math.round((alvo - inicio) / 86_400_000);
}

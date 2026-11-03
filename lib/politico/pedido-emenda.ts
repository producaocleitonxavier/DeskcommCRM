/**
 * CAPTAÇÃO DE PEDIDOS — a etapa ANTES de o parlamentar decidir.
 *
 * Hoje a emenda já nasce "indicada" (já decidida). Falta o momento anterior:
 * alguém (prefeito, entidade, liderança) PEDE uma emenda. Esse pedido entra como
 * status 'solicitada' e o gabinete depois ATENDE (vira 'indicada') ou RECUSA
 * (vira 'cancelada' com motivo). Enquanto 'solicitada', não é dinheiro alocado —
 * o painel já exclui esses das somas.
 *
 * Aqui mora só a REGRA pura (transições + validação). O efeito no banco está em
 * app/actions/politico/pedido-emenda-actions.ts.
 */

export const ORIGENS_PEDIDO = ["lideranca", "entidade", "prefeitura", "gabinete", "publico"] as const;
export type OrigemPedido = (typeof ORIGENS_PEDIDO)[number];

export const ORIGEM_LABEL: Record<OrigemPedido, string> = {
  lideranca: "Liderança",
  entidade: "Entidade",
  prefeitura: "Prefeitura",
  gabinete: "Gabinete",
  publico: "Público",
};

/** Só um pedido ainda não decidido pode ser atendido. */
export function podeAtender(status: string): boolean {
  return status === "solicitada";
}

/** Só um pedido ainda não decidido pode ser recusado. */
export function podeRecusar(status: string): boolean {
  return status === "solicitada";
}

export interface ValidacaoPedido {
  ok: boolean;
  erro?: string;
}

/** Atender não exige nada além de o pedido estar 'solicitada'. */
export function validarAtender(status: string): ValidacaoPedido {
  if (!podeAtender(status)) return { ok: false, erro: "Este pedido já foi decidido." };
  return { ok: true };
}

/** Recusar exige o pedido 'solicitada' E um motivo não-vazio (fica registrado). */
export function validarRecusar(status: string, motivo: string | null | undefined): ValidacaoPedido {
  if (!podeRecusar(status)) return { ok: false, erro: "Este pedido já foi decidido." };
  if (!(motivo ?? "").trim()) return { ok: false, erro: "Informe o motivo da recusa." };
  return { ok: true };
}

/** Normaliza a origem recebida do form (ou null se inválida). */
export function origemValida(v: string | null | undefined): OrigemPedido | null {
  const t = (v ?? "").trim() as OrigemPedido;
  return (ORIGENS_PEDIDO as readonly string[]).includes(t) ? t : null;
}

function normalizaNome(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Regras de origem em ORDEM (a primeira que casar vence). Radicais (prefeit,
 * associac, deputad...) casam por substring — igual ao classificador de área.
 * Ordem pensada: prefeitura e gabinete (origens institucionais específicas) antes
 * de entidade (guarda-chuva largo), e liderança por último (é o padrão).
 */
const REGRAS_ORIGEM: { origem: OrigemPedido; termos: string[] }[] = [
  { origem: "prefeitura", termos: ["prefeit", "subprefeit", "secretaria", "secretario", "poder executivo"] },
  { origem: "gabinete", termos: ["gabinete", "vereador", "deputad", "assessor", "chefe de gabinete", "camara municipal", "assembleia legislativa", "mandato"] },
  {
    origem: "entidade",
    termos: [
      "associac", "apae", "igreja", "paroquia", "pastoral", "sindicat", "cooperativ", "coopera",
      "federac", "confederac", "instituto", "fundac", "conselho", "ong", "clube", "rotary", "lions",
      "hospital", "santa casa", "creche", "escola", "guarda", "policia", "bombeiro", "defesa civil",
      "entidade", "centro comunitario", "comunidade terapeutica", "lar dos", "casa de apoio", "abrigo",
      "asilo", "caps", "ubs", "samu",
    ],
  },
  { origem: "lideranca", termos: ["lideranc", "lider ", "presidente de bairro", "coordenador", "diretorio", "cabo eleitoral", "pastor", "padre", "reverendo"] },
];

/**
 * Adivinha a ORIGEM pelo nome de quem está pedindo — igual a área é adivinhada
 * pelo texto. Regra de ouro: o assessor NÃO escolhe num dropdown; ele escreve
 * quem pediu ("Guarda Municipal", "Prefeitura de BH", "APAE", "João da esquina")
 * e o sistema arquiva a origem sozinho. Se errar, 1 clique pra trocar.
 *
 * Nome vazio ou sem casamento → "lideranca" (a fonte mais comum de pedido num
 * gabinete é a liderança local). Nunca lança.
 */
export function classificarOrigem(nome: string | null | undefined): OrigemPedido {
  const n = normalizaNome(nome ?? "");
  if (!n) return "lideranca";
  for (const regra of REGRAS_ORIGEM) {
    for (const termo of regra.termos) {
      if (n.includes(termo)) return regra.origem;
    }
  }
  return "lideranca";
}

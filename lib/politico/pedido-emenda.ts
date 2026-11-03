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

/**
 * MODALIDADE da emenda = COMO o recurso é transferido/executado. Diferente de
 * `tipo` (individual/bancada/comissão/relator, que é a ORIGEM parlamentar da
 * emenda) e de `area_tematica` (saúde/educação..., o SETOR).
 *
 * Ao contrário da destinação (infinita → campo livre + classificação), a
 * modalidade é um conjunto LEGAL pequeno e fechado. Então aqui dropdown limpo e
 * ACENTUADO é o certo — garante grafia única pro filtro, pro PDF e pra soma do
 * painel "por modalidade". Guardamos o rótulo acentuado direto na coluna
 * `modalidade` (texto), igual o resto do sistema já lê.
 *
 * Tudo puro e testável; sem efeito colateral.
 */

/** Conjunto padrão (rótulos acentuados). A ordem é a de uso mais comum. */
export const MODALIDADES: string[] = [
  "Convênio",
  "Transferência Especial",
  "Transferência com Finalidade Definida",
  "Fundo a Fundo",
  "Contrato de Repasse",
  "Execução Direta",
];

/** minúsculo, sem acento, espaços colapsados — para comparar grafias. */
function normaliza(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Índice: forma normalizada → rótulo canônico acentuado. */
const CANONICO: Record<string, string> = Object.fromEntries(
  MODALIDADES.map((m) => [normaliza(m), m]),
);

/**
 * Devolve o rótulo canônico acentuado de uma modalidade gravada (conserta
 * "Convenio" → "Convênio", "Transferencia Especial" → "Transferência Especial",
 * caixa e espaços). Grafia desconhecida volta como veio (fail-soft, nunca some).
 */
export function rotuloModalidade(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  return CANONICO[normaliza(t)] ?? t;
}

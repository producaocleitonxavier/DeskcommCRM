/**
 * Rótulos amigáveis das ORIGENS técnicas da base (`contacts.source`).
 *
 * O `source` é vocabulário ABERTO (origem nova aparece sozinha). Os conhecidos
 * ganham um nome humano aqui; o resto é humanizado por regra (underscores/hífens
 * viram espaço, Title Case). Centralizado porque a tela de Disparos, o seletor de
 * público e a tela de Grupos de Origem leem todos o MESMO rótulo.
 */

export const ROTULO_ORIGEM: Record<string, string> = {
  abaixo_assinado: "Abaixo-assinado",
  saga_palestras: "Palestras",
  campo: "Campo (rua)",
  sindicato_policia_civil: "Sindicato Polícia Civil",
  conselheiros_tutelares: "Conselheiros Tutelares",
  gabinete: "Gabinete",
  solene_policiacivil: "Solene Polícia Civil",
  ebook_seguranca_escolar: "Ebook Segurança Escolar",
  ebook_protecao_digital: "Ebook Proteção Digital",
  lp_pedofilia: "Proteção (landing)",
  importacao: "Importação",
  manual: "Cadastro manual",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

/**
 * Origens de SISTEMA — marcadores técnicos internos que não são "de onde a
 * pessoa veio" (campanha). Somem do seletor e da tela de Grupos pra não poluir.
 */
export const ORIGENS_OCULTAS = new Set<string>(["sistema", "form"]);

/**
 * Origem com contagem ≤ este limiar (e sem grupo) é "pouca" — vai pra uma seção
 * "Outras" recolhida, pra não espalhar origens de 1-2 pessoas no meio das que
 * importam. Fica acessível (não some): quando crescer, aparece sozinha.
 */
export const LIMIAR_POUCAS = 2;

/**
 * Paleta fria premium — dá IDENTIDADE a cada grupo de origem (um ponto + o total
 * num badge da cor), como as etapas do funil. Determinística por índice: o mesmo
 * grupo tem a mesma cor na tela de Grupos e no seletor de Disparos. "A classificar"
 * e "Outras origens" ficam NEUTROS (cinza), pra os grupos do mandato saltarem.
 */
// Ordem com CONTRASTE entre cores vizinhas (grupos consecutivos saltam): azul →
// verde → âmbar → rosa → ciano → violeta → coral → índigo. Evita dois tons
// parecidos lado a lado (azul+violeta pareciam iguais) — é o que faz o mosaico.
export const CORES_GRUPO = [
  "#60A5FA", "#34D399", "#F59E0B", "#F472B6", "#22D3EE", "#A78BFA", "#FB7185", "#818CF8",
] as const;

export function corDoGrupo(index: number): string {
  return CORES_GRUPO[((index % CORES_GRUPO.length) + CORES_GRUPO.length) % CORES_GRUPO.length]!;
}

/** Nome humano de uma origem — do mapa conhecido, ou humanizado por regra. */
export function humanizarOrigem(v: string): string {
  return (
    ROTULO_ORIGEM[v] ??
    v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

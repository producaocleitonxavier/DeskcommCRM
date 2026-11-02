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

/** Nome humano de uma origem — do mapa conhecido, ou humanizado por regra. */
export function humanizarOrigem(v: string): string {
  return (
    ROTULO_ORIGEM[v] ??
    v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

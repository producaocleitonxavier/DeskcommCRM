/**
 * RÓTULO de uma área/tipo gravado como código (`servico_publico`, `saude`) — para
 * a tela nunca mostrar o código cru ("servico publico", "assistencia_social").
 * Código conhecido sai com acento; desconhecido vira texto legível (sublinhado →
 * espaço, primeira letra maiúscula) em vez de sumir.
 */
const ROTULOS: Record<string, string> = {
  servico_publico: "Serviço público",
  infraestrutura: "Infraestrutura",
  saude: "Saúde",
  educacao: "Educação",
  seguranca: "Segurança",
  assistencia_social: "Assistência social",
  meio_ambiente: "Meio ambiente",
  documentacao: "Documentação",
  emprego: "Emprego",
  visita_tecnica: "Visita técnica",
  habitacao: "Habitação",
  transporte: "Transporte",
  mobilidade: "Mobilidade",
  cultura: "Cultura",
  esporte: "Esporte",
  economia: "Economia",
  tributacao: "Tributação",
  direitos_humanos: "Direitos humanos",
  administracao: "Administração",
  agricultura: "Agricultura",
  turismo: "Turismo",
  outro: "Outro",
  outros: "Outros",
};

export function rotuloDoTipo(codigo: string | null | undefined): string {
  const bruto = (codigo ?? "").trim();
  if (!bruto) return "";
  const chave = bruto.toLowerCase().replace(/[\s-]+/g, "_");
  const conhecido = ROTULOS[chave];
  if (conhecido) return conhecido;
  const legivel = bruto.replace(/_/g, " ").trim();
  return legivel.charAt(0).toUpperCase() + legivel.slice(1);
}

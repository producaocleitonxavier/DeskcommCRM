/**
 * O TEXTO do aviso ao cidadão (resolução / encaminhamento) — PURO, pra o servidor
 * (`avisarCidadao`) e a tela (preview do modal de edição) dizerem a MESMA coisa.
 *
 * Três variantes, a mesma régua do `avisarCidadao`:
 *  - RESOLUÇÃO: boa notícia completa, com o protocolo.
 *  - ENCAMINHAMENTO COM ofício: texto CURTO (a capa do ofício anexo).
 *  - ENCAMINHAMENTO SEM ofício: "já encaminhei, te retorno".
 *
 * Nunca promete prazo; a assinatura ("do vereador Fulano") vem da Identidade do
 * Mandato, nunca cravada.
 */
export function textoAvisoCidadao(p: {
  ehResolucao: boolean;
  /** Haverá ofício em anexo? (só no encaminhamento com texto redigido) */
  comOficio: boolean;
  primeiroNome?: string | null;
  nomeParlamentar?: string | null;
  cargo?: string | null;
  /** Rótulo/protocolo do ofício (só usado na resolução). */
  protocolo?: string | null;
}): string {
  const nome = (p.primeiroNome ?? "").trim();
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  const parl = (p.nomeParlamentar ?? "").trim();
  const cargo = (p.cargo ?? "").trim();
  const assinatura = parl ? ` do ${cargo ? cargo + " " : ""}${parl}` : "";

  if (p.ehResolucao) {
    const prot = (p.protocolo ?? "").trim();
    return (
      `${saudacao} Boa notícia: a sua demanda${prot ? ` (protocolo ${prot})` : ""} foi RESOLVIDA.` +
      ` Agradecemos a confiança e seguimos à disposição para o que precisar.` +
      ` Conte sempre com o nosso gabinete.`
    );
  }
  return p.comOficio
    ? `${saudacao} Aqui é do gabinete${assinatura}. Segue o ofício referente à demanda solicitada.`
    : `${saudacao} Aqui é do gabinete${assinatura}. Passo pra avisar que a sua demanda já foi encaminhada ao órgão responsável — assim que houver novidade, te retorno por aqui.`;
}

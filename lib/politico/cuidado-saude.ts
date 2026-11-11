/**
 * FOLLOW-UP AFETIVO ("voltar a falar / mandar um cuidado") — o OURO do sistema.
 *
 * Depois que uma demanda é RESOLVIDA, o gabinete VOLTA pra saber como a pessoa
 * está — não pra cobrar nada, só cuidado. É o que nenhum concorrente faz
 * (eles avisam "resolvido" e somem). O caso-mãe é SAÚDE (transferência de UPA
 * pra hospital, cirurgia, exame): o pedido de maior carga emocional, e onde
 * voltar pra cuidar cria vínculo irreversível.
 *
 * ⚠️ GUARDRAILS (saúde = dado pessoal SENSÍVEL, LGPD art. 11 + TSE):
 *  - É MODO ASSISTIDO: nunca sai sozinho. O assessor revisa e confirma — um
 *    "como está?" automático pra quem perdeu o parente é desastre.
 *  - A mensagem NÃO cita DIAGNÓSTICO/condição médica. Pode referenciar o SERVIÇO
 *    que o gabinete prestou (a transferência, o encaminhamento) — isso é ação do
 *    gabinete, não dado clínico.
 *  - Sem promessa, sem pedir voto. Tom caloroso, 1ª pessoa do gabinete.
 */

const DIA_MS = 86_400_000;

/** Palavras que marcam uma demanda como de SAÚDE — pra a UI alertar "sensível,
 * revise com carinho" e o texto puxar o tom de recuperação. Amplo de propósito. */
const SAUDE_RX =
  /\b(sa[úu]de|upa|hospital|hospitalar|transfer[êe]ncia|leito|uti|cirurgia|cir[úu]rgic|exame|consulta|m[ée]dic|enferm|interna[çc]|rem[ée]dio|medicament|samu|ubs|posto de sa[úu]de|fisioterap|tratament|quimioterap|hemodi[áa]lise|ambul[âa]ncia|pronto.?socorro|maternidade|parto)\b/i;

/** A demanda é de saúde? (assunto + tipo + órgão de destino). */
export function ehDemandaSaude(d: {
  assunto?: string | null;
  pol_tipo?: string | null;
  pol_orgao_destino?: string | null;
}): boolean {
  const alvo = `${d.assunto ?? ""} ${d.pol_tipo ?? ""} ${d.pol_orgao_destino ?? ""}`;
  return SAUDE_RX.test(alvo);
}

/** Cabe mandar um cuidado? A demanda foi RESOLVIDA e tem pouco tempo (o cuidado
 * tem hora — "como está?" seis meses depois é estranho). Reaproveita a mesma
 * janela do Radar de Vitórias (≤ ~90 dias da resolução). */
export function cabeCuidado(d: { estado: string; fechadaEm?: string | null }): boolean {
  if (d.estado !== "resolvida") return false;
  if (!d.fechadaEm) return true; // resolvida sem data: deixa o assessor decidir
  const dias = (Date.now() - new Date(d.fechadaEm).getTime()) / DIA_MS;
  return dias >= 0 && dias <= 90;
}

/**
 * Mensagem de WhatsApp do CUIDADO ao cidadão (após resolver). Calorosa, 1ª pessoa
 * do gabinete. Referencia o SERVIÇO prestado (o `assunto`) — nunca diagnóstico —
 * e pergunta como está, oferecendo seguir ajudando. SEM promessa, SEM pedir voto.
 * O tom muda pra "recuperação" quando é saúde. Modo assistido: o assessor pode
 * editar antes de enviar.
 */
export function textoCuidadoSaude(p: {
  primeiroNome?: string | null;
  nomeParlamentar?: string | null;
  assunto?: string | null;
  saude: boolean;
}): string {
  const nome = (p.primeiroNome ?? "").trim();
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  const parl = (p.nomeParlamentar ?? "").trim();
  const assinatura = parl ? ` do gabinete do ${parl}` : " do nosso gabinete";
  const assunto = (p.assunto ?? "").trim();
  const sobre = assunto ? ` com ${assunto}` : "";

  if (p.saude) {
    return (
      `${saudacao} Aqui é${assinatura}. Que bom ter podido ajudar${sobre} 🙏 ` +
      `Passando só pra saber como está a recuperação e se vocês estão precisando de mais alguma coisa. ` +
      `Pode contar com a gente sempre. Um abraço!`
    );
  }
  return (
    `${saudacao} Aqui é${assinatura}. Fico feliz que a gente conseguiu te ajudar${sobre} 🙂 ` +
    `Passando pra saber se ficou tudo certo e se você precisa de mais alguma coisa. ` +
    `Pode contar com a gente sempre. Um abraço!`
  );
}

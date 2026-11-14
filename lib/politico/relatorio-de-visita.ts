/**
 * RELATÓRIO DE VISITA TÉCNICA — monta o texto do relatório a partir do que a equipe
 * já registrou na visita (data, local, quem esteve, o que foi visto, o que ficou
 * decidido). Sem IA: o relatório diz o que foi registrado, com as palavras de quem
 * registrou — nada é inventado nem "melhorado".
 *
 * Fecha o ciclo do requerimento de visita: o que se pediu → o que se constatou.
 * Módulo PURO (só monta texto), para a tela e o PDF dizerem o mesmo.
 */

export type DadosDoRelatorioDeVisita = {
  assunto: string | null;
  /** Órgão que acompanhou ou é responsável pelo problema. */
  orgao?: string | null;
  municipio?: string | null;
  /** Local da ocorrência, como registrado na demanda. */
  local?: string | null;
  /** Quando a visita aconteceu (ISO). */
  realizadaEm: string | null;
  presentes?: string | null;
  relato?: string | null;
  decisoes?: string | null;
  /** Quem registrou o relato. */
  relatoPor?: string | null;
};

/** "14 de novembro de 2026", no horário de Brasília. */
export function dataDoRelatorio(iso: string | null): string | null {
  if (!iso) return null;
  // A data da visita é guardada SEM hora ("2026-11-14"). Lida como instante, vira meia-noite em
  // Greenwich = 21h do dia ANTERIOR em Brasília, e o relatório sairia um dia antes. Meio-dia de
  // Brasília não tem como cair em outro dia.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00-03:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
}

const limpo = (v: string | null | undefined): string => (v ?? "").replace(/\r\n/g, "\n").trim();

/**
 * Uma lista digitada vira itens com marcador: um por LINHA, ou — numa linha só — separados por
 * PONTO E VÍRGULA. Vírgula não separa: "Fulano, Secretário de Obras" é uma pessoa só, e o
 * relatório não pode partir o nome do cargo.
 *
 * O marcador é "– " (travessão), não "• ": o PDF põe em negrito toda linha iniciada por "• "
 * (é o destaque do PEDIDO nos ofícios), e a lista de presentes não é pedido.
 */
export function itensComMarcador(v: string | null | undefined): string {
  const texto = limpo(v);
  if (!texto) return "";
  const partes = (texto.includes("\n") ? texto.split("\n") : texto.split(";"))
    .map((p) => p.replace(/^[•\-–*\s]+/, "").replace(/[;,.\s]+$/, "").trim())
    .filter(Boolean);
  return partes.map((p, i) => `– ${p}${i < partes.length - 1 ? ";" : "."}`).join("\n");
}

/** Por que o relatório ainda NÃO pode sair, em português simples; `null` quando pode. */
export function problemaDoRelatorioDeVisita(d: DadosDoRelatorioDeVisita): string | null {
  if (!d.realizadaEm) return "Marque a visita como realizada antes de gerar o relatório.";
  if (!limpo(d.relato)) return "Registre o relato da visita antes de gerar o relatório.";
  return null;
}

/** O texto do relatório, em blocos separados por linha em branco (o PDF põe título, data e assinatura). */
export function montarRelatorioDeVisita(d: DadosDoRelatorioDeVisita): string {
  const blocos: string[] = [];
  const quando = dataDoRelatorio(d.realizadaEm);
  const onde = [limpo(d.local), limpo(d.municipio)].filter(Boolean).join(", ");
  // Ponto final só quando o campo já não termina em pontuação (evita "..").
  const fim = (v: string) => (/[.!?]$/.test(v) ? v : v + ".");
  const abertura =
    `Assunto: ${fim(limpo(d.assunto) || "Visita técnica")}` +
    (quando ? `\nData da visita: ${quando}.` : "") +
    (onde ? `\nLocal: ${fim(onde)}` : "") +
    (limpo(d.orgao) ? `\nÓrgão relacionado: ${fim(limpo(d.orgao))}` : "");
  blocos.push(abertura);

  const presentes = itensComMarcador(d.presentes);
  if (presentes) blocos.push("Estiveram presentes:\n" + presentes);

  blocos.push("O que foi constatado:\n" + limpo(d.relato));

  const decisoes = limpo(d.decisoes);
  if (decisoes) blocos.push("Encaminhamentos:\n" + decisoes);

  if (limpo(d.relatoPor)) blocos.push(`Relato registrado por ${limpo(d.relatoPor)}.`);
  return blocos.join("\n\n");
}

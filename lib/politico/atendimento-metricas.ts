/**
 * NÚMEROS DE ATENDIMENTO do Painel do Mandato — conta PURA (sem banco), sobre as
 * mensagens da janela. Responde, em linguagem de gabinete:
 *   • quantas pessoas nos procuraram;
 *   • quantas ficaram SEM resposta (o vazamento — fica à vista, nunca diluído);
 *   • em quanto tempo sai a primeira resposta (MEDIANA, não média: uma resposta
 *     que esperou a noite inteira pela trava de horário não distorce o número);
 *   • quem respondeu primeiro: a IA ou uma pessoa;
 *   • em que hora do dia o cidadão escreve.
 *
 * Régua da "primeira resposta": por conversa, a 1ª mensagem RECEBIDA na janela e
 * a 1ª mensagem ENVIADA depois dela. Sem recebida na janela, a conversa não
 * entra (não é atendimento, é envio nosso).
 *
 * `null` ≠ 0: sem nenhuma conversa respondida, a mediana é `null` ("—" na tela),
 * nunca "0 min" — a mesma regra do quadro Desempenho (`lib/metrics/canais.ts`).
 */

export interface MensagemParaMetricas {
  conversation_id: string;
  direction: "inbound" | "outbound";
  created_at: string;
  /** Preenchido quando uma PESSOA enviou; vazio = IA/sistema. */
  sent_by_user_id: string | null;
}

export interface MetricasDeAtendimento {
  /** Conversas com pelo menos 1 mensagem recebida na janela. */
  conversas: number;
  respondidas: number;
  semResposta: number;
  /** % de conversas respondidas (0–100, inteiro). `null` quando não há conversa. */
  taxaDeResposta: number | null;
  /** Mediana do tempo até a 1ª resposta, em segundos. `null` = não medido. */
  medianaPrimeiraRespostaSeg: number | null;
  primeiraRespostaPelaIA: number;
  primeiraRespostaPorPessoa: number;
  /** 24 posições (0h..23h, horário de Brasília): mensagens RECEBIDAS por hora. */
  recebidasPorHora: number[];
  /** Hora (0–23) com mais mensagens recebidas; `null` sem mensagens. */
  horaDePico: number | null;
}

const FUSO = "America/Sao_Paulo";
const horaFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" });

/** Hora do dia (0–23) no fuso de Brasília. */
export function horaDeBrasilia(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = Number(horaFmt.format(d).replace(/\D/g, ""));
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio]! : Math.round((v[meio - 1]! + v[meio]!) / 2);
}

export function calcularMetricasDeAtendimento(mensagens: readonly MensagemParaMetricas[]): MetricasDeAtendimento {
  const recebidasPorHora = new Array<number>(24).fill(0);
  const porConversa = new Map<string, MensagemParaMetricas[]>();

  for (const m of mensagens) {
    const t = new Date(m.created_at).getTime();
    if (Number.isNaN(t)) continue;
    if (m.direction === "inbound") {
      const h = horaDeBrasilia(m.created_at);
      if (h !== null) recebidasPorHora[h] = (recebidasPorHora[h] ?? 0) + 1;
    }
    const lista = porConversa.get(m.conversation_id);
    if (lista) lista.push(m);
    else porConversa.set(m.conversation_id, [m]);
  }

  let conversas = 0;
  let respondidas = 0;
  let pelaIA = 0;
  let porPessoa = 0;
  const tempos: number[] = [];

  for (const lista of porConversa.values()) {
    lista.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const primeiraRecebida = lista.find((m) => m.direction === "inbound");
    if (!primeiraRecebida) continue;
    conversas++;
    const t0 = new Date(primeiraRecebida.created_at).getTime();
    const resposta = lista.find((m) => m.direction === "outbound" && new Date(m.created_at).getTime() >= t0);
    if (!resposta) continue;
    respondidas++;
    tempos.push(Math.round((new Date(resposta.created_at).getTime() - t0) / 1000));
    if (resposta.sent_by_user_id) porPessoa++;
    else pelaIA++;
  }

  const totalRecebidas = recebidasPorHora.reduce((a, b) => a + b, 0);
  let horaDePico: number | null = null;
  if (totalRecebidas > 0) {
    let max = -1;
    recebidasPorHora.forEach((n, h) => {
      if (n > max) {
        max = n;
        horaDePico = h;
      }
    });
  }

  return {
    conversas,
    respondidas,
    semResposta: conversas - respondidas,
    taxaDeResposta: conversas > 0 ? Math.round((respondidas * 100) / conversas) : null,
    medianaPrimeiraRespostaSeg: mediana(tempos),
    primeiraRespostaPelaIA: pelaIA,
    primeiraRespostaPorPessoa: porPessoa,
    recebidasPorHora,
    horaDePico,
  };
}

/** "45 s", "12 min", "3 h 20 min", "2 dias" — e "—" quando não medido. */
export function formatarDuracao(seg: number | null): string {
  if (seg === null) return "—";
  if (seg < 60) return `${seg} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  if (h < 24) return resto ? `${h} h ${resto} min` : `${h} h`;
  const dias = Math.round(h / 24);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

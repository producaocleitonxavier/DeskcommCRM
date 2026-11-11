/**
 * A JORNADA DA ESCADA, em português — o "ver o que vai acontecer" antes de
 * publicar, que o construtor visual não tem.
 *
 * Uma escada (ver `montarEscada`) é determinística: a pessoa declara TEXTOS e
 * PRAZOS, e o caminho que o cidadão percorre sai disso sozinho. Então a
 * "simulação da jornada" não precisa do motor nem do banco — é uma leitura pura
 * da `EscadaSpec`: quando cada mensagem sai, quanto se espera, e o que acontece
 * em cada desfecho (respondeu / não respondeu). Isso é o que faz um gabinete
 * leigo montar o próprio fluxo com confiança: ele VÊ a jornada enquanto escreve.
 *
 * Duas saídas:
 *   • `jornadaDaEscada` — o mapa COMPLETO (todos os desfechos de cada toque).
 *   • `simularEscada` — TRAÇA um cenário ("ignora, ignora, responde") e devolve
 *     só o caminho que de fato acontece, com o desfecho final.
 */
import { rotuloDaEspera, type EscadaSpec } from "./modelos/escada";

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

/** Quando um momento acontece, contado do gatilho: "assim que dispara", "após 3 dias". */
function quandoDesde(ms: number): string {
  if (ms <= 0) return "assim que dispara";
  return `após ${rotuloDaEspera(ms).replace(/^Espera\s+/, "")}`;
}

/** Duração legível para o prazo de resposta ("por 2 dias", "por 4 horas"). */
function duracaoLegivel(ms: number): string {
  if (ms >= DIA_MS) {
    const d = Math.round(ms / DIA_MS);
    return d === 1 ? "1 dia" : `${d} dias`;
  }
  const h = Math.max(1, Math.round(ms / HORA_MS));
  return h === 1 ? "1 hora" : `${h} horas`;
}

export interface MomentoDaJornada {
  /** 1, 2, 3… — a ordem do toque. */
  ordem: number;
  /** Milissegundos desde o gatilho até ESTA mensagem sair. */
  msDesdeInicio: number;
  /** "assim que dispara" | "após 3 dias" — o gatilho desta mensagem. */
  quando: string;
  /** Rótulo do toque (o nome que a pessoa deu). */
  rotulo: string;
  /** O texto exato que o cidadão lê. */
  mensagem: string;
  /** "aguarda a resposta por 2 dias". */
  prazoResposta: string;
  /** O que acontece se responder no sentido esperado. */
  seResponderSim: string;
  /** O que acontece se responder qualquer outra coisa. */
  seResponderOutro: string;
  /** O que acontece se NÃO responder (próximo toque, ou encerra). */
  seNaoResponder: string;
}

export interface JornadaDaEscada {
  momentos: MomentoDaJornada[];
  totalToques: number;
  horizonteMs: number;
  /** "acompanha por até 8 dias". */
  horizonteTexto: string;
}

/**
 * O mapa COMPLETO da jornada: cada toque com quando sai, o que diz, e os três
 * desfechos. Puro — só lê a spec.
 */
export function jornadaDaEscada(spec: EscadaSpec): JornadaDaEscada {
  const momentos: MomentoDaJornada[] = [];
  let acumulado = 0;
  const notaResposta = spec.notaDeResposta?.trim() || "a conversa volta para o atendimento";

  spec.toques.forEach((toque, i) => {
    acumulado += toque.esperaAntesMs ?? 0;
    const ehUltimo = i === spec.toques.length - 1;
    momentos.push({
      ordem: i + 1,
      msDesdeInicio: acumulado,
      quando: quandoDesde(acumulado),
      rotulo: toque.rotulo,
      mensagem: toque.texto,
      prazoResposta: `aguarda a resposta por ${duracaoLegivel(spec.prazoDeRespostaMs)}`,
      seResponderSim: `encerra como GANHO — "${spec.sim.rotulo}"`,
      seResponderOutro: `encerra e ${notaResposta}`,
      seNaoResponder: ehUltimo
        ? "encerra sem resposta (ninguém mais é incomodado)"
        : "segue para a próxima mensagem",
    });
    // Se ninguém responde, o fluxo espera o prazo inteiro antes do próximo toque.
    acumulado += spec.prazoDeRespostaMs;
  });

  // O horizonte do "pior caso" (nunca respondeu) = tempo até o último prazo expirar.
  const horizonteMs = acumulado;
  return {
    momentos,
    totalToques: spec.toques.length,
    horizonteMs,
    horizonteTexto: `acompanha por até ${duracaoLegivel(horizonteMs)}`,
  };
}

/** A reação do cidadão em cada toque, no cenário simulado. */
export type Reacao = "ignora" | "responde_sim" | "responde_outro";

export interface PassoSimulado {
  ordem: number;
  quando: string;
  acao: string;
}

export interface ResultadoSimulado {
  passos: PassoSimulado[];
  desfecho: string;
  mensagensRecebidas: number;
}

/**
 * TRAÇA um cenário: dado o que o cidadão faz a cada toque (`roteiro`), devolve só
 * o caminho que de fato acontece e o desfecho. Quando o roteiro acaba antes dos
 * toques, assume que o cidadão IGNORA o resto (o pior caso). Puro.
 */
export function simularEscada(spec: EscadaSpec, roteiro: Reacao[]): ResultadoSimulado {
  const passos: PassoSimulado[] = [];
  let acumulado = 0;
  let mensagensRecebidas = 0;
  const notaResposta = spec.notaDeResposta?.trim() || "volta para o atendimento";

  for (let i = 0; i < spec.toques.length; i++) {
    const toque = spec.toques[i]!;
    acumulado += toque.esperaAntesMs ?? 0;
    mensagensRecebidas += 1;
    passos.push({
      ordem: i + 1,
      quando: quandoDesde(acumulado),
      acao: `recebe: "${toque.texto}"`,
    });

    const reacao = roteiro[i] ?? "ignora";
    if (reacao === "responde_sim") {
      passos.push({ ordem: i + 1, quando: "em resposta", acao: `responde "${spec.sim.rotulo}"` });
      return { passos, desfecho: `GANHO — ${spec.sim.rotulo}`, mensagensRecebidas };
    }
    if (reacao === "responde_outro") {
      passos.push({ ordem: i + 1, quando: "em resposta", acao: "responde outra coisa" });
      return { passos, desfecho: `encerra e ${notaResposta}`, mensagensRecebidas };
    }
    // Ignora: espera o prazo e segue (ou encerra, se for o último).
    acumulado += spec.prazoDeRespostaMs;
  }

  return {
    passos,
    desfecho: "encerra sem resposta — ninguém mais é incomodado",
    mensagensRecebidas,
  };
}

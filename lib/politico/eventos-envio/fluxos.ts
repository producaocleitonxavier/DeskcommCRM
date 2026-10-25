/**
 * OS DOIS FLUXOS DA MÁQUINA DE ENVIO DE EVENTOS (Fase 2C — Fatia 2).
 *
 * Quem se cadastra num evento (escola, igreja, praça) recebe, pelo NÚMERO
 * DEDICADO, o material que combinamos na hora — e, se consentir, vira um
 * relacionamento mensal. Isso são dois fluxos do mesmo motor de follow-up
 * (`lib/followup`), não um sender novo:
 *
 *   1. BOAS-VINDAS + EBOOK + CONSENTIMENTO (`montarFluxoBoasVindasEbook`)
 *      Entrega o material (o link do ebook já vai FIXO no texto — ver abaixo),
 *      espera um dia e pergunta se a pessoa quer continuar recebendo. Quem
 *      responde "sim" fecha como ganho (`converted`) — é esse desfecho que o app
 *      lê para graduar o lead e inscrever no drip.
 *
 *   2. DRIP MENSAL (`montarFluxoDripMensal`)
 *      Um toque por mês, com conteúdo da Biblioteca. As esperas são IMUNES à
 *      resposta (`immune_to_reply`) — a cadência de um mês não é antecipada nem
 *      cancelada porque a pessoa escreveu hoje; o atendimento responde por fora,
 *      o drip segue no seu relógio.
 *
 * ⚠️ POR QUE O EBOOK VAI FIXO NO TEXTO, E NÃO NUMA VARIÁVEL. O modo `text` do nó
 * de ação NÃO interpola nada (`{{...}}` é reprovado — a mensagem aparece na tela
 * de bloqueio e campo de ficha não pode vazar). O ebook muda por EVENTO, então a
 * solução é um fluxo de boas-vindas POR EBOOK: o link entra como CONSTANTE no
 * momento de montar o grafo (igual aos textos fixos dos modelos de clínica), não
 * como variável em runtime. No cadastro, a pessoa é inscrita no fluxo do ebook
 * que aquele evento escolheu.
 *
 * TRÊS REGRAS QUE OS TEXTOS OBEDECEM (não é estilo — ver `modelos/politico.ts`):
 *   • Nenhum texto afirma preferência política nem nomeia candidato/gabinete.
 *   • Nenhum texto promete (autoridade pública que não cumpre é dano político).
 *   • Consentimento-primeiro: só quem responde "sim" entra no envio mensal.
 */
import { montarEscada } from "@/lib/followup/modelos/escada";
import type { FlowGraph, FlowNode, FlowEdge } from "@/lib/followup/graph-schema";

const DIA_MS = 86_400_000;
/** Cadência padrão do drip: uma vez por mês. */
export const INTERVALO_DRIP_MS = 30 * DIA_MS;

/** Quem responde o fluxo está falando com o gabinete, não com o robô. */
const O_ATENDIMENTO_ASSUME =
  "A pessoa respondeu — quem segue a conversa é o atendimento do gabinete.";

export interface EntradaBoasVindasEbook {
  /** Título do material, como a pessoa o reconhece (ex.: "Combate ao Bullying"). */
  ebookTitulo: string;
  /** Link do material. Entra FIXO no texto (constante de build, não interpolação). */
  ebookUrl: string;
}

/**
 * Fluxo de boas-vindas de um evento, com o ebook embutido e a pergunta de
 * consentimento. Reusa a ESCADA (manda → espera resposta → encerra), com o
 * gatilho `manual` e `cancel_on_reply: false` definidos no modelo/instalador —
 * aqui a resposta PRECISA rotear (sim/não), então a reatividade não pode cancelar
 * a inscrição antes do nó de resposta decidir.
 *
 * A pessoa que responde "sim" cai no fim `converted`; é esse desfecho que a
 * graduação (app) observa para subir `novo_cadastro → simpatizante` e inscrever
 * no drip. Qualquer outra resposta devolve a conversa ao atendimento.
 */
export function montarFluxoBoasVindasEbook(entrada: EntradaBoasVindasEbook): FlowGraph {
  const titulo = entrada.ebookTitulo.trim();
  const url = entrada.ebookUrl.trim();

  return montarEscada({
    prazoDeRespostaMs: 2 * DIA_MS,
    sim: { rotulo: "Quer continuar recebendo", padrao: "sim" },
    notaDeResposta: O_ATENDIMENTO_ASSUME,
    toques: [
      {
        rotulo: "Entrega o material",
        texto:
          `Oi! Que bom ter você com a gente no evento 🙏 Como combinamos, aqui está o material *${titulo}*:\n\n${url}\n\n` +
          "Espero que seja útil pra você e pra sua família. Qualquer dúvida, é só me responder por aqui.",
      },
      {
        esperaAntesMs: DIA_MS,
        rotulo: "Pede consentimento",
        texto:
          "Posso continuar te enviando materiais e novidades como esse, de vez em quando? " +
          "Se puder, responde *SIM* aqui 🙂 Se preferir não receber, é só avisar que eu não te envio mais.",
      },
    ],
  });
}

export interface ToqueDrip {
  /** Rótulo do nó no construtor (o que aparece no canvas). */
  rotulo: string;
  /** Texto exatamente como a pessoa lê. Sem variável — o modo `text` não interpola. */
  texto: string;
}

export interface EntradaDripMensal {
  toques: ToqueDrip[];
  /** Intervalo entre toques. Default: um mês. */
  intervaloMs?: number;
}

const COLUNA = 260;

/**
 * Drip mensal: um toque por mês, cada um precedido de uma espera IMUNE à resposta.
 *
 * É um grafo linear (sem ramo de resposta): trigger → espera → mensagem → espera
 * → mensagem → ... → fim. As esperas são `immune_to_reply: true` para a cadência
 * não ser antecipada nem cancelada quando a pessoa escreve — é o status dormente
 * que tira a inscrição do alcance da reatividade (ver `waitConfigSchema`). Os
 * textos nascem genéricos (rascunho); o gabinete os edita antes de publicar.
 */
export function montarFluxoDripMensal(entrada: EntradaDripMensal): FlowGraph {
  const intervalo = entrada.intervaloMs ?? INTERVALO_DRIP_MS;
  const toques = entrada.toques;
  if (toques.length === 0) throw new Error("drip precisa de ao menos um toque");

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let coluna = 0;
  const x = () => COLUNA * coluna++;

  const INICIO = "inicio";
  const FIM = "fim";
  nodes.push({ id: INICIO, type: "trigger", label: "Início", position: { x: x(), y: 0 }, config: {} });

  let anterior = INICIO;
  toques.forEach((toque, i) => {
    const n = i + 1;
    const espera = `espera-${n}`;
    nodes.push({
      id: espera,
      type: "wait",
      label: `Espera ${Math.round(intervalo / DIA_MS)} dias`,
      position: { x: x(), y: 0 },
      config: { mode: "fixed", duration_ms: intervalo, immune_to_reply: true },
    });
    edges.push(aresta(anterior, espera));

    const msg = `msg-${n}`;
    nodes.push({
      id: msg,
      type: "action",
      label: toque.rotulo,
      position: { x: x(), y: 0 },
      config: { mode: "text", body: toque.texto },
    });
    edges.push(aresta(espera, msg));
    anterior = msg;
  });

  nodes.push({
    id: FIM,
    type: "end",
    label: "Fim do ciclo",
    position: { x: COLUNA * coluna, y: 0 },
    config: { outcome: "converted" },
  });
  edges.push(aresta(anterior, FIM));

  return { nodes, edges };
}

function aresta(source: string, target: string): FlowEdge {
  return { id: `${source}__${target}`, source, target, priority: 0, condition: { type: "always" } };
}

/**
 * Rascunho de conteúdo do drip — três meses genéricos que o gabinete edita antes
 * de publicar. Textos propositalmente neutros (sem nome, sem promessa): o valor
 * real vem quando o gabinete troca pelos materiais da própria Biblioteca.
 */
export const TOQUES_DRIP_PADRAO: readonly ToqueDrip[] = [
  {
    rotulo: "Mês 1 · material novo",
    texto:
      "Oi! Passando pra deixar um material novo que preparamos, no mesmo espírito do que você já recebeu. " +
      "Se quiser, dá uma olhada e me conta o que achou 🙂",
  },
  {
    rotulo: "Mês 2 · o que anda sendo feito",
    texto:
      "Oi! Um resumo rápido do que anda sendo feito por aqui, caso queira acompanhar. " +
      "Se tiver alguma demanda do seu bairro, é só me escrever.",
  },
  {
    rotulo: "Mês 3 · continua por aqui",
    texto:
      "Oi! Continuo por aqui pra qualquer coisa que você precisar. " +
      "Se quiser receber mais conteúdos como os anteriores, é só responder 🙏",
  },
];

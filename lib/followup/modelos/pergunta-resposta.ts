/**
 * O GRAFO "PERGUNTA → SE SIM, MANDA O MATERIAL" — o RAMO que a escada não faz.
 *
 * A escada (`escada.ts`) só INSISTE com quem não responde e ENCERRA quando a
 * pessoa topa. Mas o gabinete pensa diferente: "pergunto se quer o conteúdo; se
 * disser SIM, eu MANDO (o link/material); se não responder, mando um lembrete e
 * paro". Isso é um RAMO — a resposta "sim" dispara uma AÇÃO, não só um fim.
 *
 * Desenho (determinístico, idêntico para todo objetivo que pede resposta):
 *
 *   Início → Pergunta → [aguarda]
 *       ├─ respondeu SIM → MANDA O MATERIAL → Fim (ganho)
 *       ├─ respondeu outra coisa → Fim (atendimento assume)
 *       └─ não respondeu → [lembrete opcional] → [aguarda de novo]
 *                               ├─ SIM → MANDA O MATERIAL → Fim (ganho)
 *                               ├─ outra → Fim (atendimento assume)
 *                               └─ não → Fim (sem resposta)
 *
 * Os dois "SIM" apontam para o MESMO nó de material (uma ação, dois caminhos de
 * entrada) — assim o texto do material vive num lugar só.
 */
import type { FlowGraph, FlowNode, FlowEdge } from "@/lib/followup/graph-schema";

export interface PerguntaRespostaSpec {
  /** A pergunta que abre ("Quer receber o conteúdo? Responda sim."). */
  pergunta: { rotulo: string; texto: string };
  /** O padrão textual que conta como "sim" (ex.: "sim"). */
  simPadrao: string;
  simRotulo: string;
  /** A mensagem que SAI quando a pessoa topa — o material (texto + link). */
  material: { rotulo: string; texto: string };
  /** Quanto tempo cada aguardo segura antes de seguir por "não respondeu". */
  prazoDeRespostaMs: number;
  /** Lembrete opcional para quem não respondeu à pergunta. Ausente = sem lembrete. */
  lembrete?: { esperaAntesMs: number; rotulo: string; texto: string };
  /** Nota do fim "respondeu outra coisa": quem assume dali. */
  notaDeResposta: string;
}

const COLUNA = 260;

export function montarPerguntaResposta(spec: PerguntaRespostaSpec): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let coluna = 0;
  const x = () => COLUNA * coluna++;

  const INICIO = "inicio";
  const PERGUNTA = "pergunta";
  const AGUARDA_1 = "aguarda-1";
  const MATERIAL = "material";
  const FIM_GANHO = "fim-ganho";
  const FIM_RESPONDEU = "fim-respondeu";
  const FIM_ESGOTOU = "fim-esgotou";

  nodes.push({ id: INICIO, type: "trigger", label: "Início", position: { x: x(), y: 0 }, config: {} });

  nodes.push({
    id: PERGUNTA,
    type: "action",
    label: spec.pergunta.rotulo,
    position: { x: x(), y: 0 },
    config: { mode: "text", body: spec.pergunta.texto },
  });
  edges.push(aresta(INICIO, PERGUNTA));

  nodes.push({
    id: AGUARDA_1,
    type: "match_reply",
    label: "Espera a resposta",
    position: { x: x(), y: 0 },
    config: {
      branches: [{ id: "topou", label: spec.simRotulo, op: "contains", pattern: spec.simPadrao }],
      grace_timeout_ms: spec.prazoDeRespostaMs,
    },
  });
  edges.push(aresta(PERGUNTA, AGUARDA_1));

  // O nó do material — para onde os dois "sim" apontam.
  const colMaterial = coluna; // reservamos a coluna; posicionamos depois
  nodes.push({
    id: MATERIAL,
    type: "action",
    label: spec.material.rotulo,
    position: { x: COLUNA * colMaterial, y: -220 },
    config: { mode: "text", body: spec.material.texto },
  });
  edges.push(aresta(AGUARDA_1, MATERIAL, { type: "branch", branch_id: "topou" }));
  edges.push(aresta(AGUARDA_1, FIM_RESPONDEU, { type: "always" }));

  // Caminho do silêncio: lembrete opcional + um segundo aguardo.
  if (spec.lembrete) {
    const ESPERA = "espera-lembrete";
    const LEMBRETE = "lembrete";
    const AGUARDA_2 = "aguarda-2";
    nodes.push({
      id: ESPERA,
      type: "wait",
      label: rotuloDaEspera(spec.lembrete.esperaAntesMs),
      position: { x: COLUNA * (colMaterial), y: 220 },
      config: { mode: "fixed", duration_ms: spec.lembrete.esperaAntesMs },
    });
    nodes.push({
      id: LEMBRETE,
      type: "action",
      label: spec.lembrete.rotulo,
      position: { x: COLUNA * (colMaterial + 1), y: 220 },
      config: { mode: "text", body: spec.lembrete.texto },
    });
    nodes.push({
      id: AGUARDA_2,
      type: "match_reply",
      label: "Espera a resposta",
      position: { x: COLUNA * (colMaterial + 2), y: 220 },
      config: {
        branches: [{ id: "topou", label: spec.simRotulo, op: "contains", pattern: spec.simPadrao }],
        grace_timeout_ms: spec.prazoDeRespostaMs,
      },
    });
    edges.push(aresta(AGUARDA_1, ESPERA, { type: "branch", branch_id: "no_reply" }));
    edges.push(aresta(ESPERA, LEMBRETE));
    edges.push(aresta(LEMBRETE, AGUARDA_2));
    edges.push(aresta(AGUARDA_2, MATERIAL, { type: "branch", branch_id: "topou" }));
    edges.push(aresta(AGUARDA_2, FIM_RESPONDEU, { type: "always" }));
    edges.push(aresta(AGUARDA_2, FIM_ESGOTOU, { type: "branch", branch_id: "no_reply" }));
  } else {
    edges.push(aresta(AGUARDA_1, FIM_ESGOTOU, { type: "branch", branch_id: "no_reply" }));
  }

  edges.push(aresta(MATERIAL, FIM_GANHO));

  const xFim = COLUNA * (coluna + 3);
  nodes.push(
    { id: FIM_GANHO, type: "end", label: "Fim: topou (mandei o material)", position: { x: xFim, y: -220 }, config: { outcome: "converted" } },
    { id: FIM_RESPONDEU, type: "end", label: "Fim: respondeu", position: { x: xFim, y: 0 }, config: { outcome: "custom", note: spec.notaDeResposta } },
    { id: FIM_ESGOTOU, type: "end", label: "Fim: sem resposta", position: { x: xFim, y: 220 }, config: { outcome: "exhausted" } },
  );

  return { nodes, edges };
}

function aresta(
  source: string,
  target: string,
  condition: FlowEdge["condition"] = { type: "always" },
): FlowEdge {
  const sufixo = condition.type === "branch" ? condition.branch_id : "segue";
  return { id: `${source}__${target}__${sufixo}`, source, target, priority: 0, condition };
}

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;
function rotuloDaEspera(ms: number): string {
  if (ms >= DIA_MS) {
    const dias = Math.round(ms / DIA_MS);
    return dias === 1 ? "Espera 1 dia" : `Espera ${dias} dias`;
  }
  const horas = Math.max(1, Math.round(ms / HORA_MS));
  return horas === 1 ? "Espera 1 hora" : `Espera ${horas} horas`;
}

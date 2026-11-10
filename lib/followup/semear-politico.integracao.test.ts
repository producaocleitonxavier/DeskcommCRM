/**
 * TESTE DE INTEGRAÇÃO — os 3 follow-ups do gabinete, exercitados de ponta a
 * ponta: eles passam no MESMO portão de publicação que a tela usa
 * (`validateFlowForPublish`), têm os gatilhos certos, 3 toques cada, prazos
 * plausíveis e nenhum texto que vaze variável. Também IMPRIME o conteúdo real
 * (mensagens + esperas) para inspeção humana da qualidade.
 */
import { describe, expect, it } from "vitest";

import { MODELOS_DE_POLITICO } from "./modelos/politico";
import { modelosDoNicho } from "./modelos";
import { toquesDoModelo, horizonteDoModeloMs } from "./modelos/tipos";
import { flowGraphSchema } from "./graph-schema";
import { validateFlowForPublish } from "./validate-publish";
import { linhasDeModelosPoliticos } from "./semear-politico";

const DIA = 86_400_000;

function mensagensEmOrdem(grafo: { nodes: Array<{ id: string; type: string; config: unknown }> }) {
  // Nós de ação na ordem msg-1, msg-2, msg-3; espera que antecede, se houver.
  const linhas: string[] = [];
  const acoes = grafo.nodes.filter((n) => n.type === "action");
  for (const a of acoes) {
    const n = Number(a.id.replace("msg-", ""));
    const espera = grafo.nodes.find((e) => e.type === "wait" && e.id === `espera-${n}`);
    const esperaMs = espera ? (espera.config as { duration_ms: number }).duration_ms : 0;
    const body = (a.config as { body: string }).body;
    const quando = esperaMs ? `(após ${Math.round(esperaMs / DIA)}d) ` : "(na hora) ";
    linhas.push(`      ${n}. ${quando}${body}`);
  }
  return linhas.join("\n");
}

describe("integração · os 3 follow-ups do gabinete", () => {
  it("o catálogo do nicho político são só os do gabinete, sem vazar clínica", () => {
    const politico = modelosDoNicho("politico");
    const clinica = modelosDoNicho("clinica");
    expect(politico).toHaveLength(2);
    expect(politico).toHaveLength(MODELOS_DE_POLITICO.length);
    expect(clinica.length).toBeGreaterThan(0);
    const idsPol = new Set(politico.map((m) => m.id));
    expect(clinica.some((c) => idsPol.has(c.id))).toBe(false); // zero sobreposição
  });

  it("cada um passa no PORTÃO REAL de publicação (validateFlowForPublish)", () => {
    for (const m of MODELOS_DE_POLITICO) {
      const g = flowGraphSchema.safeParse(m.grafo);
      expect(g.success, `${m.id}: grafo inválido`).toBe(true);
      if (g.success) {
        const v = validateFlowForPublish(g.data);
        expect(v.ok, `${m.id}: ${v.ok ? "" : JSON.stringify(v)}`).toBe(true);
      }
    }
  });

  it("gatilhos certos: boas-vindas=lead_created, pós-atendimento=manual (reconexão saiu)", () => {
    const porId = Object.fromEntries(MODELOS_DE_POLITICO.map((m) => [m.id, m.gatilho({}).kind]));
    expect(porId["politico-boas-vindas"]).toBe("lead_created");
    expect(porId["politico-pos-atendimento"]).toBe("manual");
    expect(porId["politico-reconexao"]).toBeUndefined(); // tirado do v1 (silêncio = risco)
  });

  it("enxutos: 2 mensagens cada e horizonte plausível (5–20 dias)", () => {
    for (const m of MODELOS_DE_POLITICO) {
      expect(toquesDoModelo(m.grafo), `${m.id}: nº de toques`).toBe(2);
      const dias = horizonteDoModeloMs(m.grafo) / DIA;
      expect(dias, `${m.id}: ${dias}d`).toBeGreaterThanOrEqual(5);
      expect(dias, `${m.id}: ${dias}d`).toBeLessThanOrEqual(20);
    }
  });

  it("nenhum texto vaza variável ({{) nem fica vazio", () => {
    for (const m of MODELOS_DE_POLITICO) {
      for (const n of m.grafo.nodes) {
        if (n.type !== "action") continue;
        const body = (n.config as { body?: string }).body ?? "";
        expect(body.length, `${m.id}: corpo vazio`).toBeGreaterThan(0);
        expect(body.includes("{{"), `${m.id}: vazou variável`).toBe(false);
      }
    }
  });

  it("todos os 3 cancelam na resposta (cancel_on_reply) e pausam (handoff)", () => {
    for (const m of MODELOS_DE_POLITICO) {
      expect(m.gatilho({}).cancel_on_reply, `${m.id}`).toBe(true);
      expect(m.handoffPolicy, `${m.id}`).toBe("pause");
    }
    for (const l of linhasDeModelosPoliticos("org")) expect(l.handoff_policy).toBe("pause");
  });

  it("IMPRIME o conteúdo real dos 3 fluxos (inspeção humana)", () => {
    const linhas: string[] = ["\n╔══ CONTEÚDO REAL — o que a Rose recebe (rascunho) ══╗"];
    for (const m of MODELOS_DE_POLITICO) {
      linhas.push(`\n  ▸ ${m.nome}`);
      linhas.push(`    dispara: ${m.oQueDispara}`);
      linhas.push(`    ${toquesDoModelo(m.grafo)} mensagens · acompanha ~${Math.round(horizonteDoModeloMs(m.grafo) / DIA)} dias · cancela se a pessoa responde`);
      linhas.push(mensagensEmOrdem(m.grafo));
    }
    linhas.push("\n╚═══════════════════════════════════════════════════╝");
    // eslint-disable-next-line no-console
    console.log(linhas.join("\n"));
    expect(true).toBe(true);
  });
});

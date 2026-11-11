import { describe, expect, it } from "vitest";

import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { validateFlowForPublish } from "@/lib/followup/validate-publish";
import { montarPerguntaResposta, type PerguntaRespostaSpec } from "./pergunta-resposta";

const DIA = 86_400_000;

const COM_LEMBRETE: PerguntaRespostaSpec = {
  pergunta: { rotulo: "Oferece o conteúdo", texto: "Quer receber nosso material? Responda sim." },
  simPadrao: "sim",
  simRotulo: "Quer receber",
  material: { rotulo: "Manda o material", texto: "Combinado! Aqui está: https://exemplo.com/material" },
  prazoDeRespostaMs: 2 * DIA,
  lembrete: { esperaAntesMs: 3 * DIA, rotulo: "Lembrete", texto: "Ainda dá tempo. Responda sim que eu te mando." },
  notaDeResposta: "A pessoa respondeu — o atendimento assume.",
};

const SEM_LEMBRETE: PerguntaRespostaSpec = { ...COM_LEMBRETE, lembrete: undefined };

describe("montarPerguntaResposta — o ramo 'se sim, manda'", () => {
  it("com lembrete: passa no schema E no validador de publicação", () => {
    const g = flowGraphSchema.parse(montarPerguntaResposta(COM_LEMBRETE));
    const r = validateFlowForPublish(g);
    expect(r.ok, r.ok ? "" : JSON.stringify(r.errors)).toBe(true);
  });

  it("sem lembrete: passa no schema E no validador de publicação", () => {
    const g = flowGraphSchema.parse(montarPerguntaResposta(SEM_LEMBRETE));
    const r = validateFlowForPublish(g);
    expect(r.ok, r.ok ? "" : JSON.stringify(r.errors)).toBe(true);
  });

  it("os dois 'sim' (pergunta e lembrete) apontam para o MESMO nó de material", () => {
    const g = montarPerguntaResposta(COM_LEMBRETE);
    const paraMaterial = g.edges.filter(
      (e) => e.target === "material" && e.condition.type === "branch" && e.condition.branch_id === "topou",
    );
    expect(paraMaterial).toHaveLength(2);
    // E o material leva ao fim de ganho.
    expect(g.edges.some((e) => e.source === "material" && e.target === "fim-ganho")).toBe(true);
  });

  it("o material é uma AÇÃO de texto (o que a escada não fazia no 'sim')", () => {
    const g = montarPerguntaResposta(SEM_LEMBRETE);
    const material = g.nodes.find((n) => n.id === "material");
    expect(material?.type).toBe("action");
    expect(material?.config).toMatchObject({ mode: "text" });
  });
});

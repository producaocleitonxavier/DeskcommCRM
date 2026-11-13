import { describe, expect, it } from "vitest";

import { detectarPromessaDeCampanha } from "@/lib/agent-engine/guardrails/promessa-de-campanha";
import { interpolateTemplate } from "@/lib/inbox/template-vars";

import { respostasSugeridas } from "./respostas-sugeridas";

const todas = respostasSugeridas({ nomeParlamentar: "Fulano de Tal", cargo: "Vereador" });

describe("respostas prontas sugeridas", () => {
  it("são nove, com título e atalho únicos", () => {
    expect(todas).toHaveLength(9);
    expect(new Set(todas.map((r) => r.titulo)).size).toBe(9);
    expect(new Set(todas.map((r) => r.atalho)).size).toBe(9);
    for (const r of todas) expect(r.atalho).toMatch(/^[a-z]+$/);
  });

  it("nenhuma dispara o alerta de promessa de campanha", () => {
    for (const r of todas) {
      const achado = detectarPromessaDeCampanha(r.texto);
      expect(achado.achou, `${r.titulo}: ${achado.categorias.join(",")}`).toBe(false);
    }
  });

  it("nenhuma promete prazo, garante resultado, pede voto ou leva link", () => {
    for (const r of todas) {
      expect(r.texto, r.titulo).not.toMatch(/https?:|www\./i);
      expect(r.texto, r.titulo).not.toMatch(/\bvot[oae]|apoi[oe]\b|eleiç|campanha/i);
      expect(r.texto, r.titulo).not.toMatch(/garant|promet|em até \d|dentro de \d|vamos resolver|será resolvid/i);
    }
  });

  it("a apresentação usa o nome do mandato; sem nome, cai em 'nosso gabinete'", () => {
    expect(todas[0]!.texto).toContain("gabinete do Vereador Fulano de Tal");
    expect(respostasSugeridas({})[0]!.texto).toContain("nosso gabinete");
    expect(respostasSugeridas({ nomeParlamentar: "Fulano" })[0]!.texto).toContain("gabinete do Fulano");
  });

  it("o nome da pessoa entra na hora de inserir", () => {
    const pronto = interpolateTemplate(todas[2]!.texto, { name: "Maria da Silva" });
    expect(pronto.startsWith("Maria, o seu pedido foi registrado")).toBe(true);
  });

  it("o que só o gabinete sabe vem entre colchetes, para preencher uma vez", () => {
    const horario = todas.find((r) => r.atalho === "horario")!;
    expect(horario.texto).toContain("[dias e horário de atendimento]");
    expect(horario.texto).toContain("[endereço do gabinete]");
  });

  it("controle negativo: nenhuma vem vazia nem longa demais para uma mensagem", () => {
    for (const r of todas) {
      expect(r.texto.trim().length, r.titulo).toBeGreaterThan(30);
      expect(r.texto.length, r.titulo).toBeLessThan(700);
    }
  });
});

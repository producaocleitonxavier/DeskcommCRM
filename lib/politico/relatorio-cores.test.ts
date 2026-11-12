import { describe, expect, it } from "vitest";

import { PALETA_RELATORIO, fatiasPorValor } from "./relatorio-cores";

describe("fatiasPorValor — composição colorida dos relatórios", () => {
  it("conta por valor, ordena da maior para a menor e ignora vazios", () => {
    const f = fatiasPorValor(["Agendada", "Realizada", "Agendada", "", "—", null, "Atrasada", "Agendada"]);
    expect(f.map((x) => [x.label, x.valor])).toEqual([["Agendada", 3], ["Atrasada", 1], ["Realizada", 1]]);
  });

  it("situação conhecida tem cor de significado fixa (com ou sem acento/caixa)", () => {
    const f = fatiasPorValor(["Concluída", "ATRASADA", "planejada"]);
    const cor = Object.fromEntries(f.map((x) => [x.label, x.cor]));
    expect(cor["Concluída"]).toBe("#17A673");
    expect(cor["ATRASADA"]).toBe("#D9486A");
    expect(cor["planejada"]).toBe("#2F6FB5");
  });

  it("rótulo desconhecido recebe a paleta em ordem, sem repetir cor", () => {
    const f = fatiasPorValor(["Escola", "Escola", "Igreja", "Praça"]);
    expect(f.map((x) => x.cor)).toEqual([PALETA_RELATORIO[0], PALETA_RELATORIO[1], PALETA_RELATORIO[2]]);
    expect(new Set(f.map((x) => x.cor)).size).toBe(3);
  });

  it("não repete cor quando significado e paleta coincidem", () => {
    // "Realizada" = verde (#17A673), que também é a 2ª da paleta.
    const f = fatiasPorValor(["Realizada", "Realizada", "Xis", "Ypsilon"]);
    expect(new Set(f.map((x) => x.cor)).size).toBe(3);
  });

  it("mais de 6 categorias: as menores viram 'Outros' e a soma se conserva", () => {
    const valores = ["a", "a", "a", "b", "b", "c", "d", "e", "f", "g", "h"];
    const f = fatiasPorValor(valores);
    expect(f.length).toBe(6);
    expect(f[f.length - 1]!.label).toBe("Outros");
    expect(f.reduce((s, x) => s + x.valor, 0)).toBe(valores.length);
  });

  it("exatamente 6 categorias cabem sem 'Outros'", () => {
    const f = fatiasPorValor(["a", "b", "c", "d", "e", "f"]);
    expect(f.length).toBe(6);
    expect(f.some((x) => x.label === "Outros")).toBe(false);
  });

  it("controle negativo: lista sem valor útil devolve vazio", () => {
    expect(fatiasPorValor(["", "—", null, undefined])).toEqual([]);
  });
});

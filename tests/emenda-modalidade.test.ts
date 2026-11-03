import { describe, it, expect } from "vitest";

import { MODALIDADES, rotuloModalidade } from "@/lib/politico/emenda-modalidade";

describe("emenda-modalidade — lista padrão", () => {
  it("traz as modalidades canônicas acentuadas", () => {
    expect(MODALIDADES.length).toBeGreaterThanOrEqual(5);
    expect(MODALIDADES).toContain("Convênio");
    expect(MODALIDADES).toContain("Transferência Especial");
    // Todas acentuadas/limpas (sem duplicata por grafia).
    const normsset = new Set(MODALIDADES.map((m) => m.toLowerCase()));
    expect(normsset.size).toBe(MODALIDADES.length);
  });
});

describe("emenda-modalidade — rotuloModalidade (conserta grafia)", () => {
  it("conserta ausência de acento → canônico", () => {
    expect(rotuloModalidade("Convenio")).toBe("Convênio");
    expect(rotuloModalidade("Transferencia Especial")).toBe("Transferência Especial");
  });
  it("conserta caixa e espaços extras", () => {
    expect(rotuloModalidade("CONVENIO")).toBe("Convênio");
    expect(rotuloModalidade("  transferencia   especial  ")).toBe("Transferência Especial");
  });
  it("já canônico permanece igual", () => {
    expect(rotuloModalidade("Convênio")).toBe("Convênio");
  });
  it("grafia desconhecida volta como veio (fail-soft)", () => {
    expect(rotuloModalidade("Emenda Maluca do Zé")).toBe("Emenda Maluca do Zé");
  });
  it("vazio/nulo/indefinido → string vazia sem quebrar (controle negativo)", () => {
    expect(rotuloModalidade("")).toBe("");
    expect(rotuloModalidade("   ")).toBe("");
    expect(rotuloModalidade(null)).toBe("");
    expect(rotuloModalidade(undefined)).toBe("");
  });
});

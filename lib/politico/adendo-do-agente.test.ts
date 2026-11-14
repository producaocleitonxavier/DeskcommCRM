import { describe, expect, it } from "vitest";
import { adendoDoGabinete, apresentacaoDaIA, cargoComArtigo } from "./adendo-do-agente";

describe("adendo do gabinete ao agente de IA", () => {
  it("cargo com o artigo certo", () => {
    expect(cargoComArtigo("Vereador")).toBe("do vereador");
    expect(cargoComArtigo("Vereadora")).toBe("da vereadora");
    expect(cargoComArtigo("Deputado Estadual")).toBe("do deputado estadual");
    expect(cargoComArtigo("Deputada Federal")).toBe("da deputada federal");
    expect(cargoComArtigo("Senadora")).toBe("da senadora");
    expect(cargoComArtigo("Prefeita")).toBe("da prefeita");
    expect(cargoComArtigo("Prefeito")).toBe("do prefeito");
    expect(cargoComArtigo("  ")).toBeNull();
  });

  it("apresentação serve para qualquer político e degrada sem dados", () => {
    expect(apresentacaoDaIA({ nomeParlamentar: "Cleiton Xavier", cargo: "Vereador" })).toBe(
      "Sou a IA do gabinete do vereador Cleiton Xavier.",
    );
    expect(apresentacaoDaIA({ nomeParlamentar: "Ana Lima", cargo: "Deputada Estadual" })).toBe(
      "Sou a IA do gabinete da deputada estadual Ana Lima.",
    );
    expect(apresentacaoDaIA({ nomeParlamentar: "Ana Lima" })).toBe("Sou a IA do gabinete de Ana Lima.");
    expect(apresentacaoDaIA({})).toBe("Sou a IA do gabinete.");
  });

  it("o adendo traz a apresentação e a regra de saúde e crianças, sem nome fixo de cliente", () => {
    const a = adendoDoGabinete({ nomeParlamentar: "Fulano", cargo: "Vereador" });
    expect(a).toContain('"Sou a IA do gabinete do vereador Fulano."');
    expect(a).toContain("SAÚDE E CRIANÇAS");
    expect(a).toContain("passe a conversa para a equipe");
    expect(adendoDoGabinete({})).not.toContain("Cleiton");
  });
});

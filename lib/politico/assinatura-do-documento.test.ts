import { describe, expect, it } from "vitest";

import { linhasDaAssinatura, linhasGuardadasDaAssinatura } from "./assinatura-do-documento";

describe("texto do bloco de assinatura", () => {
  it("sem nada guardado vale o nome e o cargo da Identidade", () => {
    expect(linhasDaAssinatura({ gabinete: {} }, "Cleiton Xavier", "Vereador")).toEqual({ linha1: "Cleiton Xavier", linha2: "Vereador" });
    expect(linhasDaAssinatura(null, null, null)).toEqual({ linha1: "", linha2: "" });
  });

  it("o gabinete escolhe as duas linhas como assina", () => {
    const s = { gabinete: { assinatura_do_documento: { linha1: " Vereador  Cleiton Xavier ", linha2: "União Brasil" } } };
    expect(linhasDaAssinatura(s, "Cleiton Xavier", "Vereador")).toEqual({ linha1: "Vereador Cleiton Xavier", linha2: "União Brasil" });
  });

  it("só a linha de cima preenchida = uma linha só (o cargo não volta por baixo)", () => {
    const s = { gabinete: { assinatura_do_documento: { linha1: "Vereador Cleiton Xavier", linha2: "" } } };
    expect(linhasDaAssinatura(s, "Cleiton Xavier", "Vereador")).toEqual({ linha1: "Vereador Cleiton Xavier", linha2: "" });
  });

  it("só a de baixo preenchida: a de cima cai no nome", () => {
    const s = { gabinete: { assinatura_do_documento: { linha2: "União Brasil" } } };
    expect(linhasDaAssinatura(s, "Cleiton Xavier", "Vereador")).toEqual({ linha1: "Cleiton Xavier", linha2: "União Brasil" });
  });

  it("lixo e texto gigante não passam", () => {
    expect(linhasGuardadasDaAssinatura({ gabinete: { assinatura_do_documento: { linha1: 7, linha2: "a".repeat(500) } } })).toEqual({
      linha1: "",
      linha2: "a".repeat(80),
    });
    expect(linhasGuardadasDaAssinatura({ gabinete: { assinatura_do_documento: "x" } })).toEqual({ linha1: "", linha2: "" });
  });
});

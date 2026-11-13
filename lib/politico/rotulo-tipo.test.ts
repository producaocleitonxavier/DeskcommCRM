import { describe, expect, it } from "vitest";

import { rotuloDoTipo } from "./rotulo-tipo";

describe("rotuloDoTipo — a tela nunca mostra o código cru", () => {
  it("códigos conhecidos saem com acento", () => {
    expect(rotuloDoTipo("servico_publico")).toBe("Serviço público");
    expect(rotuloDoTipo("seguranca")).toBe("Segurança");
    expect(rotuloDoTipo("assistencia_social")).toBe("Assistência social");
    expect(rotuloDoTipo("visita_tecnica")).toBe("Visita técnica");
    expect(rotuloDoTipo("saude")).toBe("Saúde");
  });

  it("aceita o código com espaço, hífen ou maiúscula", () => {
    expect(rotuloDoTipo("servico publico")).toBe("Serviço público");
    expect(rotuloDoTipo("Meio-Ambiente")).toBe("Meio ambiente");
    expect(rotuloDoTipo("SAUDE")).toBe("Saúde");
  });

  it("código desconhecido vira texto legível, não some", () => {
    expect(rotuloDoTipo("defesa_do_consumidor")).toBe("Defesa do consumidor");
    expect(rotuloDoTipo("Zoonoses")).toBe("Zoonoses");
  });

  it("texto já escrito pelo gabinete é respeitado", () => {
    expect(rotuloDoTipo("Saúde mental")).toBe("Saúde mental");
  });

  it("controle negativo: vazio e nulo não inventam rótulo", () => {
    expect(rotuloDoTipo(null)).toBe("");
    expect(rotuloDoTipo(undefined)).toBe("");
    expect(rotuloDoTipo("   ")).toBe("");
  });
});

import { describe, it, expect } from "vitest";

import {
  podeAtender,
  podeRecusar,
  validarAtender,
  validarRecusar,
  origemValida,
} from "@/lib/politico/pedido-emenda";

describe("pedido-emenda — quem pode atender/recusar", () => {
  it("só 'solicitada' pode ser atendida ou recusada", () => {
    expect(podeAtender("solicitada")).toBe(true);
    expect(podeRecusar("solicitada")).toBe(true);
    for (const s of ["indicada", "empenhada", "paga", "cancelada", "rascunho"]) {
      expect(podeAtender(s)).toBe(false);
      expect(podeRecusar(s)).toBe(false);
    }
  });
});

describe("pedido-emenda — validação de atender", () => {
  it("atende um pedido 'solicitada'", () => {
    expect(validarAtender("solicitada")).toEqual({ ok: true });
  });
  it("NÃO atende um pedido já decidido (controle negativo)", () => {
    expect(validarAtender("indicada").ok).toBe(false);
    expect(validarAtender("paga").ok).toBe(false);
  });
});

describe("pedido-emenda — validação de recusar (exige motivo)", () => {
  it("recusa 'solicitada' com motivo", () => {
    expect(validarRecusar("solicitada", "Fora do escopo do mandato")).toEqual({ ok: true });
  });
  it("recusar SEM motivo é rejeitado (controle negativo)", () => {
    expect(validarRecusar("solicitada", "").ok).toBe(false);
    expect(validarRecusar("solicitada", "   ").ok).toBe(false);
    expect(validarRecusar("solicitada", null).ok).toBe(false);
  });
  it("recusar um pedido já decidido é rejeitado mesmo com motivo", () => {
    expect(validarRecusar("indicada", "qualquer").ok).toBe(false);
  });
});

describe("pedido-emenda — origem (CAMPO ABERTO: texto livre)", () => {
  it("devolve o texto aparado, qualquer que seja", () => {
    expect(origemValida("Guarda Municipal")).toBe("Guarda Municipal"); // o caso do cliente
    expect(origemValida("Prefeitura")).toBe("Prefeitura");
    expect(origemValida("  Associação de Moradores  ")).toBe("Associação de Moradores");
  });
  it("vazio/nulo/indefinido → null (controle negativo)", () => {
    expect(origemValida("")).toBeNull();
    expect(origemValida("   ")).toBeNull();
    expect(origemValida(null)).toBeNull();
    expect(origemValida(undefined)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";

import {
  podeAtender,
  podeRecusar,
  validarAtender,
  validarRecusar,
  origemValida,
  classificarOrigem,
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

describe("pedido-emenda — origem", () => {
  it("aceita origens válidas", () => {
    expect(origemValida("lideranca")).toBe("lideranca");
    expect(origemValida("prefeitura")).toBe("prefeitura");
    expect(origemValida("publico")).toBe("publico");
  });
  it("rejeita origem inválida → null", () => {
    expect(origemValida("qualquer")).toBeNull();
    expect(origemValida("")).toBeNull();
    expect(origemValida(null)).toBeNull();
  });
});

describe("pedido-emenda — classificarOrigem (adivinha pelo nome de quem pede)", () => {
  it("reconhece a PREFEITURA / executivo municipal", () => {
    expect(classificarOrigem("Prefeitura de Belo Horizonte")).toBe("prefeitura");
    expect(classificarOrigem("Secretaria Municipal de Saúde")).toBe("prefeitura");
    expect(classificarOrigem("Prefeito João")).toBe("prefeitura");
  });
  it("reconhece ENTIDADE / órgão / coletivo organizado", () => {
    expect(classificarOrigem("Guarda Municipal")).toBe("entidade"); // o caso do cliente
    expect(classificarOrigem("APAE de Contagem")).toBe("entidade");
    expect(classificarOrigem("Associação de Moradores do Bairro X")).toBe("entidade");
    expect(classificarOrigem("Igreja Batista Central")).toBe("entidade");
  });
  it("reconhece GABINETE / origem interna do mandato", () => {
    expect(classificarOrigem("Gabinete do vereador")).toBe("gabinete");
    expect(classificarOrigem("Assessor Pedro")).toBe("gabinete");
  });
  it("reconhece LIDERANÇA comunitária", () => {
    expect(classificarOrigem("Liderança do Barreiro")).toBe("lideranca");
    expect(classificarOrigem("Presidente de bairro Maria")).toBe("lideranca");
  });
  it("nome comum de pessoa → lideranca (padrão seguro, editável)", () => {
    expect(classificarOrigem("João da Silva")).toBe("lideranca");
  });
  it("nome vazio/nulo → lideranca sem quebrar (controle negativo)", () => {
    expect(classificarOrigem("")).toBe("lideranca");
    expect(classificarOrigem(null)).toBe("lideranca");
    expect(classificarOrigem(undefined)).toBe("lideranca");
  });
  it("não confunde 'secretaria' de entidade com acento/caixa — normaliza", () => {
    expect(classificarOrigem("SECRETARIA de Educação")).toBe("prefeitura");
    expect(classificarOrigem("Polícia Militar")).toBe("entidade");
  });
});

import { describe, expect, it } from "vitest";

import { ehDemandaSaude, cabeCuidado, textoCuidadoSaude } from "./cuidado-saude";

const DIA = 86_400_000;
const haDias = (n: number) => new Date(Date.now() - n * DIA).toISOString();

describe("ehDemandaSaude", () => {
  it("pega transferência de UPA / hospital", () => {
    expect(ehDemandaSaude({ assunto: "transferência da UPA Pampulha para o Hospital Evangélico" })).toBe(true);
  });
  it("pega por órgão de destino (Secretaria de Saúde)", () => {
    expect(ehDemandaSaude({ assunto: "pedido", pol_orgao_destino: "Sec. de Saúde" })).toBe(true);
  });
  it("NÃO marca demanda não-saúde (tapa-buraco)", () => {
    expect(ehDemandaSaude({ assunto: "buraco na rua", pol_orgao_destino: "SUDECAP" })).toBe(false);
  });
});

describe("cabeCuidado", () => {
  it("cabe quando resolvida há pouco (10 dias)", () => {
    expect(cabeCuidado({ estado: "resolvida", fechadaEm: haDias(10) })).toBe(true);
  });
  it("NÃO cabe se não está resolvida", () => {
    expect(cabeCuidado({ estado: "aberta", fechadaEm: haDias(10) })).toBe(false);
  });
  it("NÃO cabe se resolvida há muito tempo (>90 dias)", () => {
    expect(cabeCuidado({ estado: "resolvida", fechadaEm: haDias(120) })).toBe(false);
  });
  it("resolvida sem data: deixa o assessor decidir (true)", () => {
    expect(cabeCuidado({ estado: "resolvida", fechadaEm: null })).toBe(true);
  });
});

describe("textoCuidadoSaude", () => {
  it("saúde: tom de recuperação, cita o serviço, abre com o nome", () => {
    const t = textoCuidadoSaude({
      primeiroNome: "Leonardo",
      nomeParlamentar: "Cleiton Xavier",
      assunto: "a transferência do seu tio para o Hospital Evangélico",
      saude: true,
    });
    expect(t).toMatch(/^Olá, Leonardo!/);
    expect(t).toContain("gabinete do Cleiton Xavier");
    expect(t).toContain("a transferência do seu tio para o Hospital Evangélico");
    expect(t).toContain("recuperação");
  });

  it("não-saúde: tom geral (sem 'recuperação')", () => {
    const t = textoCuidadoSaude({ primeiroNome: "Ana", assunto: "a poda da árvore", saude: false });
    expect(t).not.toContain("recuperação");
    expect(t).toContain("a poda da árvore");
  });

  it("GUARDRAIL: sem promessa, sem pedir voto, sem vazar variável", () => {
    const t = textoCuidadoSaude({ primeiroNome: "José", nomeParlamentar: "Fulano", assunto: "o exame", saude: true });
    expect(t).not.toContain("{{");
    expect(t).not.toMatch(/voto|vote|resolvo até|garanto|prometo/i);
  });

  it("sem nome e sem parlamentar: genérico, não inventa", () => {
    const t = textoCuidadoSaude({ saude: true });
    expect(t).toMatch(/^Olá! /);
    expect(t).toContain("do nosso gabinete");
  });
});

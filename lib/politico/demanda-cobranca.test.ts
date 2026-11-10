import { describe, expect, it } from "vitest";

import { demandaVencidaSemResposta, textoCobrancaCidadao } from "./demanda-cobranca";

const DIA = 86_400_000;
const haDias = (n: number) => new Date(Date.now() - n * DIA).toISOString();

describe("demandaVencidaSemResposta", () => {
  it("vencida (aberta há 40d), aberta e órgão sem resposta → cabe cobrar", () => {
    expect(
      demandaVencidaSemResposta({ estado: "aberta", abertaEm: haDias(40), prazoDias: 30, respondeu: false }),
    ).toBe(true);
  });

  it("NÃO cobra se o órgão já respondeu (mesmo vencida)", () => {
    expect(
      demandaVencidaSemResposta({ estado: "aberta", abertaEm: haDias(40), prazoDias: 30, respondeu: true }),
    ).toBe(false);
  });

  it("NÃO cobra dentro do prazo (aberta há 5d, prazo 30d)", () => {
    expect(
      demandaVencidaSemResposta({ estado: "aberta", abertaEm: haDias(5), prazoDias: 30, respondeu: false }),
    ).toBe(false);
  });

  it("NÃO cobra demanda já fechada (resolvida/encerrada)", () => {
    expect(
      demandaVencidaSemResposta({ estado: "resolvida", abertaEm: haDias(40), prazoDias: 30, respondeu: false }),
    ).toBe(false);
    expect(
      demandaVencidaSemResposta({ estado: "encerrada", abertaEm: haDias(40), prazoDias: 30, respondeu: false }),
    ).toBe(false);
  });

  it("prazo nulo usa o padrão de 30 dias (vencida só após 30d)", () => {
    expect(
      demandaVencidaSemResposta({ estado: "aberta", abertaEm: haDias(40), prazoDias: null, respondeu: false }),
    ).toBe(true);
    expect(
      demandaVencidaSemResposta({ estado: "aberta", abertaEm: haDias(20), prazoDias: null, respondeu: false }),
    ).toBe(false);
  });
});

describe("textoCobrancaCidadao", () => {
  it("abre com o primeiro nome quando há", () => {
    expect(textoCobrancaCidadao({ primeiroNome: "Maria" })).toMatch(/^Olá, Maria!/);
  });

  it("abre com 'Olá!' sem nome", () => {
    expect(textoCobrancaCidadao({})).toMatch(/^Olá! /);
  });

  it("diz que está cobrando e cita o assunto quando há", () => {
    const t = textoCobrancaCidadao({ primeiroNome: "João", assunto: "o buraco na Rua X" });
    expect(t).toContain("estamos cobrando");
    expect(t).toContain("o buraco na Rua X");
    expect(t).toContain("ainda não se manifestou");
  });

  it("usa o nome do parlamentar quando há, genérico quando não há", () => {
    expect(textoCobrancaCidadao({ nomeParlamentar: "Cleiton Xavier" })).toContain("gabinete do Cleiton Xavier");
    expect(textoCobrancaCidadao({})).toContain("do nosso gabinete");
  });

  it("NÃO promete prazo nem vaza variável (guardrail TSE/LGPD)", () => {
    const t = textoCobrancaCidadao({ primeiroNome: "Ana", nomeParlamentar: "Fulano", assunto: "a poda da árvore" });
    expect(t).not.toContain("{{");
    expect(t).not.toMatch(/resolvo até|vou resolver|garanto|prometo/i);
  });
});

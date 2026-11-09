/**
 * Blindagem do PERFILAMENTO CONVERSACIONAL do QR (cidade/bairro/aniversário).
 *
 * A leitura da data de aniversário por texto livre é a parte mais delicada do
 * fluxo — gente escreve de mil jeitos. Estes testes travam o comportamento pra
 * esse padrão não quebrar em nenhum cliente. São funções PURAS (sem banco).
 */
import { describe, expect, it } from "vitest";

import { limparCampoCurto, parseDiaMes } from "@/lib/politico/qr-cadastro";

describe("parseDiaMes — leitura do aniversário (dia/mês, sem ano)", () => {
  it("lê os formatos comuns de DD/MM", () => {
    expect(parseDiaMes("14/09")).toEqual({ dia: 14, mes: 9 });
    expect(parseDiaMes("14/9")).toEqual({ dia: 14, mes: 9 });
    expect(parseDiaMes("14-09")).toEqual({ dia: 14, mes: 9 });
    expect(parseDiaMes("14.09")).toEqual({ dia: 14, mes: 9 });
    expect(parseDiaMes("14 09")).toEqual({ dia: 14, mes: 9 });
    expect(parseDiaMes("22/08")).toEqual({ dia: 22, mes: 8 });
    expect(parseDiaMes("01/01")).toEqual({ dia: 1, mes: 1 });
  });

  it("lê com frase em volta e com nome do mês por extenso", () => {
    expect(parseDiaMes("meu aniversário é 3/12")).toEqual({ dia: 3, mes: 12 });
    expect(parseDiaMes("14 de setembro")).toEqual({ dia: 14, mes: 9 });
    expect(parseDiaMes("5 de maio")).toEqual({ dia: 5, mes: 5 });
    expect(parseDiaMes("nasci dia 7 de dezembro")).toEqual({ dia: 7, mes: 12 });
  });

  it("aceita 29/02 (ano sentinela 2000 é bissexto)", () => {
    expect(parseDiaMes("29/02")).toEqual({ dia: 29, mes: 2 });
  });

  it("rejeita datas impossíveis (dia não cabe no mês, mês inválido)", () => {
    expect(parseDiaMes("31/04")).toBeNull(); // abril tem 30
    expect(parseDiaMes("30/02")).toBeNull(); // fev tem 29 no sentinela
    expect(parseDiaMes("32/01")).toBeNull(); // dia > 31
    expect(parseDiaMes("00/05")).toBeNull(); // dia 0
    expect(parseDiaMes("14/13")).toBeNull(); // mês > 12
    expect(parseDiaMes("10/00")).toBeNull(); // mês 0
  });

  it("rejeita o que não é data (re-pergunta no fluxo)", () => {
    expect(parseDiaMes("oi")).toBeNull();
    expect(parseDiaMes("não sei")).toBeNull();
    expect(parseDiaMes("👍")).toBeNull();
    expect(parseDiaMes("")).toBeNull();
    expect(parseDiaMes(null)).toBeNull();
    expect(parseDiaMes("14")).toBeNull(); // só o dia, sem mês
  });
});

describe("limparCampoCurto — cidade/bairro", () => {
  it("higieniza e preserva nomes válidos", () => {
    expect(limparCampoCurto("Belo Horizonte")).toBe("Belo Horizonte");
    expect(limparCampoCurto("  Savassi  ")).toBe("Savassi");
    expect(limparCampoCurto("São João del-Rei")).toBe("São João del-Rei");
    expect(limparCampoCurto("BH")).toBe("BH"); // 2 letras é o mínimo
    expect(limparCampoCurto("Jd.  Primavera")).toBe("Jd. Primavera"); // colapsa espaços
  });

  it("rejeita o que não é nome de lugar", () => {
    expect(limparCampoCurto("a")).toBeNull(); // curto demais
    expect(limparCampoCurto("123")).toBeNull(); // sem letra
    expect(limparCampoCurto("👍")).toBeNull(); // sem letra
    expect(limparCampoCurto("")).toBeNull();
    expect(limparCampoCurto(null)).toBeNull();
    expect(limparCampoCurto("x".repeat(121))).toBeNull(); // longo demais
  });
});

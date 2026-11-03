import { describe, it, expect } from "vitest";

import {
  normalizarOrgao,
  corDoOrgao,
  rollupPorOrgao,
  orgaosSugeridos,
  type DemandaCobranca,
} from "@/lib/politico/demanda-cobranca";

const PASSADO = "2020-01-01T12:00:00.000Z"; // bem no passado → sempre atrasada
const AGORA = new Date().toISOString(); // recém-aberta → dentro do prazo

describe("demanda-cobranca — normalizarOrgao", () => {
  it("apara e colapsa espaços; vazio/nulo → ''", () => {
    expect(normalizarOrgao("  COPASA  ")).toBe("COPASA");
    expect(normalizarOrgao("Sec.   de    Obras")).toBe("Sec. de Obras");
    expect(normalizarOrgao("")).toBe("");
    expect(normalizarOrgao(null)).toBe("");
    expect(normalizarOrgao(undefined)).toBe("");
  });
});

describe("demanda-cobranca — corDoOrgao (determinística)", () => {
  it("mesmo nome → sempre a mesma cor (e ignora espaços)", () => {
    expect(corDoOrgao("COPASA")).toEqual(corDoOrgao("COPASA"));
    expect(corDoOrgao("  COPASA ")).toEqual(corDoOrgao("COPASA"));
  });
  it("vazio → cinza neutro", () => {
    expect(corDoOrgao("").color).toBe("#9CA3AF");
    expect(corDoOrgao("   ").color).toBe("#9CA3AF");
  });
  it("ANTI-TAUTOLOGIA: não é uma cor fixa — nomes distintos dão cores distintas", () => {
    // COPASA cai no índice 0, CEMIG no índice 3 (hashes diferentes).
    expect(corDoOrgao("COPASA")).not.toEqual(corDoOrgao("CEMIG"));
    expect(corDoOrgao("COPASA").color).not.toBe(corDoOrgao("CEMIG").color);
    // E nenhuma delas é o cinza do "sem órgão".
    expect(corDoOrgao("COPASA").color).not.toBe("#9CA3AF");
  });
});

describe("demanda-cobranca — rollupPorOrgao", () => {
  const itens: DemandaCobranca[] = [
    { orgao: "COPASA", estado: "em_atendimento", abertaEm: PASSADO, prazoDias: 30, respondeu: false }, // atrasada + sem resposta
    { orgao: "COPASA", estado: "em_atendimento", abertaEm: AGORA, prazoDias: 30, respondeu: true }, // no prazo + respondeu
    { orgao: "CEMIG", estado: "aberta", abertaEm: PASSADO, prazoDias: null, respondeu: false }, // atrasada (prazo padrão) + sem resposta
    { orgao: "COPASA", estado: "resolvida", abertaEm: PASSADO, prazoDias: 30, respondeu: false }, // FECHADA: não cobra
    { orgao: null, estado: "aberta", abertaEm: PASSADO, prazoDias: 30, respondeu: false }, // sem órgão → ignora
    { orgao: "   ", estado: "aberta", abertaEm: PASSADO, prazoDias: 30, respondeu: false }, // só espaço → ignora
  ];

  const r = rollupPorOrgao(itens);

  it("agrupa por órgão e ignora os sem órgão", () => {
    expect(r.map((x) => x.orgao).sort()).toEqual(["CEMIG", "COPASA"]);
  });
  it("conta total, atrasadas e sem-resposta corretamente", () => {
    const copasa = r.find((x) => x.orgao === "COPASA")!;
    expect(copasa.total).toBe(3); // as 3 da COPASA (inclui a resolvida no total)
    expect(copasa.atrasadas).toBe(1); // só a aberta+vencida (a no prazo e a resolvida não contam)
    expect(copasa.semResposta).toBe(1); // só a aberta sem resposta (a respondida e a resolvida não contam)
  });
  it("CONTROLE NEGATIVO: demanda resolvida+atrasada NÃO entra em atrasadas", () => {
    const copasa = r.find((x) => x.orgao === "COPASA")!;
    // Se contasse a resolvida vencida, seriam 2. Tem que ser 1.
    expect(copasa.atrasadas).not.toBe(2);
  });
  it("ordena por total desc (COPASA antes de CEMIG)", () => {
    expect(r[0]!.orgao).toBe("COPASA");
    expect(r[1]!.orgao).toBe("CEMIG");
  });
  it("não lança com lista vazia/nula", () => {
    expect(rollupPorOrgao([])).toEqual([]);
    expect(rollupPorOrgao(undefined as unknown as DemandaCobranca[])).toEqual([]);
  });
});

describe("demanda-cobranca — orgaosSugeridos por mandato", () => {
  it("dep_federal → federal; dep_estadual → estadual; resto → municipal", () => {
    expect(orgaosSugeridos("dep_federal")).toContain("DNIT");
    expect(orgaosSugeridos("dep_estadual")).toContain("DER-MG");
    expect(orgaosSugeridos("vereador")).toContain("BHTRANS");
    expect(orgaosSugeridos(null)).toContain("COPASA"); // default municipal
  });
});

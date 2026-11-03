import { describe, it, expect } from "vitest";

import {
  normalizarOrgao,
  corDoOrgao,
  rollupPorOrgao,
  orgaosSugeridos,
  precisaCobrar,
  ordenarUrgencia,
  textoCobranca,
  alertaCobranca,
  type DemandaCobranca,
  type OrgaoRollup,
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

describe("demanda-cobranca — precisaCobrar", () => {
  it("aberta + órgão não respondeu → true", () => {
    expect(precisaCobrar({ estado: "em_atendimento", respondeu: false })).toBe(true);
    expect(precisaCobrar({ estado: "encaminhada", respondeu: false })).toBe(true);
  });
  it("respondeu → false (não precisa cobrar)", () => {
    expect(precisaCobrar({ estado: "em_atendimento", respondeu: true })).toBe(false);
  });
  it("CONTROLE NEGATIVO: resolvida/encerrada → false mesmo sem resposta", () => {
    expect(precisaCobrar({ estado: "resolvida", respondeu: false })).toBe(false);
    expect(precisaCobrar({ estado: "encerrada", respondeu: false })).toBe(false);
  });
});

describe("demanda-cobranca — ordenarUrgencia", () => {
  it("ANTI-TAUTOLOGIA: órgão com atrasadas vem antes mesmo com total MENOR", () => {
    const a: OrgaoRollup = { orgao: "A", total: 5, atrasadas: 0, semResposta: 0 };
    const b: OrgaoRollup = { orgao: "B", total: 1, atrasadas: 2, semResposta: 1 };
    const ordenado = [a, b].sort(ordenarUrgencia);
    expect(ordenado[0]!.orgao).toBe("B"); // B queima mais, apesar de ter menos no total
    expect(ordenado[1]!.orgao).toBe("A");
  });
  it("empate em atrasadas → desempata por sem-resposta, depois total", () => {
    const x: OrgaoRollup = { orgao: "X", total: 3, atrasadas: 1, semResposta: 1 };
    const y: OrgaoRollup = { orgao: "Y", total: 9, atrasadas: 1, semResposta: 3 };
    const ordenado = [x, y].sort(ordenarUrgencia);
    expect(ordenado[0]!.orgao).toBe("Y"); // mesma atraso, Y tem mais sem-resposta
  });
});

describe("demanda-cobranca — textoCobranca (ofício de reiteração)", () => {
  it("com rótulo encaixa o número do ofício", () => {
    const t = textoCobranca({ rotuloAnterior: "OF. GAB 048/2026", assunto: "iluminação da praça" });
    expect(t).toContain("Ofício nº OF. GAB 048/2026");
    expect(t).toContain("referente a iluminação da praça");
    expect(t).toContain("não obteve resposta");
  });
  it("sem rótulo/assunto usa a variante genérica e não lança", () => {
    const t = textoCobranca({ rotuloAnterior: null, assunto: null });
    expect(t).toContain("ofício anteriormente encaminhado");
    expect(t).toContain("demanda em referência");
    expect(t).toContain("não obteve resposta");
    expect(() => textoCobranca({})).not.toThrow();
  });
});

describe("alertaCobranca — aviso proativo (aberta + atrasada + sem resposta)", () => {
  const base = (over: Partial<DemandaCobranca>): DemandaCobranca => ({
    orgao: "COPASA", estado: "em_atendimento", abertaEm: PASSADO, prazoDias: 30, respondeu: false, ...over,
  });
  it("conta só aberta + atrasada + sem resposta, agrupa por órgão (qtd desc)", () => {
    const r = alertaCobranca([
      base({ orgao: "COPASA" }),
      base({ orgao: "COPASA" }),
      base({ orgao: "SLU" }),
    ]);
    expect(r.total).toBe(3);
    expect(r.porOrgao[0]).toEqual({ orgao: "COPASA", qtd: 2 });
    expect(r.porOrgao[1]).toEqual({ orgao: "SLU", qtd: 1 });
  });
  it("exclui respondeu=true e demanda fechada (controle negativo)", () => {
    const r = alertaCobranca([
      base({ respondeu: true }),
      base({ estado: "resolvida" }),
    ]);
    expect(r.total).toBe(0);
  });
  it("ANTI-TAUTOLOGIA: sem resposta mas DENTRO do prazo não entra (depende do atraso)", () => {
    const r = alertaCobranca([base({ abertaEm: AGORA })]);
    expect(r.total).toBe(0);
  });
  it("lista vazia → total 0 sem quebrar", () => {
    expect(alertaCobranca([])).toEqual({ total: 0, porOrgao: [] });
  });
});

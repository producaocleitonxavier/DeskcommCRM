import { describe, expect, it } from "vitest";

import { fonteOficialDoMandato, montarPromptDePesquisa, parseAchados } from "./pesquisar-mandato";
import type { DadosDoMandato } from "./gerar-conhecimento";

function mandato(over: Partial<DadosDoMandato>): DadosDoMandato {
  return {
    nome: null, cargo: null, cidade: null, uf: null, tipo: null, horario: null, whats: null,
    insta: null, endereco: null, email: null, agendaContato: null, portal: null, servicos: [],
    orgaos: null, bio: null, temas: null, ...over,
  };
}

describe("fonteOficialDoMandato — mira pela TIPO de mandato", () => {
  it("vereador → Câmara Municipal da cidade", () => {
    expect(fonteOficialDoMandato(mandato({ tipo: "vereador", cidade: "Contagem" }))).toContain("Câmara Municipal de Contagem");
  });
  it("dep_estadual → Assembleia do estado", () => {
    expect(fonteOficialDoMandato(mandato({ tipo: "dep_estadual", uf: "MG" }))).toContain("Assembleia Legislativa de MG");
  });
  it("dep_federal → Câmara dos Deputados", () => {
    expect(fonteOficialDoMandato(mandato({ tipo: "dep_federal" }))).toContain("Câmara dos Deputados");
  });
  it("prefeito → Prefeitura da cidade", () => {
    expect(fonteOficialDoMandato(mandato({ tipo: "prefeito", cidade: "BH" }))).toContain("Prefeitura de BH");
  });
});

describe("montarPromptDePesquisa — direcionado + 2 baldes + guardrail", () => {
  const p = montarPromptDePesquisa(mandato({ nome: "Fulano", cargo: "Vereador", cidade: "Contagem", tipo: "vereador" }));
  it("nomeia a pessoa e a fonte oficial certa", () => {
    expect(p).toContain("Fulano");
    expect(p).toContain("Câmara Municipal de Contagem");
  });
  it("exige os 2 baldes e a fonte, e proíbe promessa", () => {
    expect(p).toContain('"cidadao"');
    expect(p).toContain('"equipe"');
    expect(p).toMatch(/fonte/i);
    expect(p).toMatch(/NUNCA|promessa/i);
  });
});

describe("parseAchados — robusto a cercas e texto ao redor", () => {
  const bom = '[{"balde":"cidadao","titulo":"PL 1.246/2019","resumo":"Autor da campanha contra assédio.","fonte":"https://almg.gov.br/x"}]';

  it("JSON puro", () => {
    expect(parseAchados(bom)).toHaveLength(1);
  });
  it("com cercas ```json e texto antes/depois", () => {
    const r = parseAchados("Aqui está:\n```json\n" + bom + "\n```\nPronto.");
    expect(r).toHaveLength(1);
    expect(r[0]!.balde).toBe("cidadao");
  });
  it("filtra item inválido (balde fora do enum) e mantém o válido", () => {
    const misto = '[{"balde":"outro","titulo":"x","resumo":"y","fonte":"z"},{"balde":"equipe","titulo":"Aliança","resumo":"Vice-líder do bloco.","fonte":"https://x"}]';
    const r = parseAchados(misto);
    expect(r).toHaveLength(1);
    expect(r[0]!.balde).toBe("equipe");
  });
  it("não-array vira vazio", () => {
    expect(parseAchados('{"balde":"cidadao"}')).toEqual([]);
    expect(parseAchados("não encontrei nada")).toEqual([]);
  });
});

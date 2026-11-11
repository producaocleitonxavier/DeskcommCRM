import { describe, expect, it } from "vitest";

import {
  parsearCsvPontoEVirgula,
  normalizarTexto,
  indicesDasColunas,
  moedaRsBrParaCents,
  statusAlmgPorExecucao,
  ehReprovada,
  extrairEmendasDoAutor,
} from "./gov-emendas-almg";

// Mini-CSV com o MESMO formato do arquivo oficial da ALMG: separador ";",
// cabeçalho com acento, valores "R$...,..", um campo entre aspas com ";" dentro,
// uma emenda reprovada (deve ser ignorada) e um homônimo parcial (não casa).
const HEADER =
  "Ano da Indicação;Número da Indicação;Indicador de Impositividade;Tipo de Indicação;Status da Indicação;Autor;Genêro;Categoria;Especificação;Tipo de Aplicação;Unidade Orçamentária Código;Unidade Orçamentária Sigla;Unidade Orçamentária Descrição;Função Código;Função Descrição;Número da Ação;Nome da Ação;Grupo de Despesa Código;Grupo de Despesa Descrição;Município ;Macrorregião de Planejamento;Estado;País;Descrição do Tipo de Beneficiário;Nome Beneficiário;Número do CNPJ do Beneficiário;Código Escola;Minêmo Saúde ou Educação;Descrição da Indicação;Valor Indicado;Valor Utilizado;Valor Empenhado no Ano;Valor Pago Atualizado;Classificação do IOT;Justificativa de Reprovação;Status;Número do Instrumento;Status do Instrumento;Código SIAFI do Instrumento;Data de Publicação do Instrumento;Data de Validade do Instrumento;Agência;Agência Dígito;Conta;Conta Dígito;Tipo de autoria";

// 46 colunas; preenche só as que importam, resto vazio.
function linha(campos: Record<number, string>): string {
  const arr = new Array(46).fill("");
  for (const [i, v] of Object.entries(campos)) arr[Number(i)] = v;
  return arr.join(";");
}

const APROVADA_PAGA = linha({
  0: "2020",
  1: "23933",
  4: "APROVADO",
  5: "MAURO TRAMONTE",
  14: "SEGURANÇA PÚBLICA",
  16: "POLICIAMENTO OSTENSIVO GERAL",
  19: "BELO HORIZONTE",
  24: "POLÍCIA MILITAR",
  29: "R$64.000,00",
  30: "R$64.000,00",
  31: "R$64.000,00",
  32: "R$64.000,00",
});
// campo entre aspas com ";" dentro da descrição; só empenhado (status empenhada)
const APROVADA_EMPENHADA = `2021;24010;S;EXECUÇÃO DIRETA;APROVADO;MAURO TRAMONTE;-;-;-;-;;;;6;SAÚDE;;AÇÃO X;;;UBERLÂNDIA;TRIÂNGULO;MINAS GERAIS;BRASIL;ÓRGÃO;SEC SAÚDE;;;;"Custeio de UPA; reforma";R$10.000,00;R$0,00;R$10.000,00;R$0,00;;;;;;;;;;;;;`;
const REPROVADA = linha({ 0: "2022", 1: "25000", 4: "REPROVADO PELO ÓRGÃO", 5: "MAURO TRAMONTE", 29: "R$5.000,00" });
const OUTRO_AUTOR = linha({ 0: "2020", 1: "99999", 4: "APROVADO", 5: "ADALCLEVER LOPES", 29: "R$1.000,00" });

const CSV = [HEADER, APROVADA_PAGA, APROVADA_EMPENHADA, REPROVADA, OUTRO_AUTOR].join("\n");

describe("parsearCsvPontoEVirgula", () => {
  it("respeita aspas e ';' dentro de campo citado", () => {
    const linhas = parsearCsvPontoEVirgula(CSV);
    expect(linhas[0].length).toBe(46);
    // a linha empenhada tem a descrição citada com ';' — não pode quebrar a contagem
    const empenhada = linhas.find((r) => r[1] === "24010")!;
    expect(empenhada.length).toBe(46);
    expect(empenhada[28]).toBe("Custeio de UPA; reforma");
  });
});

describe("normalizarTexto", () => {
  it("tira acento, maiúsculo, espaço único", () => {
    expect(normalizarTexto(" Mauro  Tramonte ")).toBe("MAURO TRAMONTE");
    expect(normalizarTexto("Saúde")).toBe("SAUDE");
  });
});

describe("indicesDasColunas", () => {
  it("resolve as colunas-chave pelo cabeçalho", () => {
    const col = indicesDasColunas(parsearCsvPontoEVirgula(CSV)[0]);
    expect(col.autor).toBe(5);
    expect(col.ano).toBe(0);
    expect(col.numero).toBe(1);
    expect(col.indicado).toBe(29);
    expect(col.empenhado).toBe(31);
    expect(col.pago).toBe(32);
    expect(col.municipio).toBe(19); // "Município " com espaço no fim
  });
});

describe("moedaRsBrParaCents", () => {
  it("converte R$64.000,00 -> 6400000", () => {
    expect(moedaRsBrParaCents("R$64.000,00")).toBe(6_400_000);
  });
  it("tolera espaço, vazio e sem prefixo", () => {
    expect(moedaRsBrParaCents("R$ 1.234,56")).toBe(123_456);
    expect(moedaRsBrParaCents("10,00")).toBe(1000);
    expect(moedaRsBrParaCents("")).toBe(0);
    expect(moedaRsBrParaCents(null)).toBe(0);
  });
});

describe("statusAlmgPorExecucao", () => {
  it("deriva pela execução (paga > liquidada > empenhada > indicada)", () => {
    expect(statusAlmgPorExecucao({ empenhadoCents: 1, utilizadoCents: 1, pagoCents: 1 })).toBe("paga");
    expect(statusAlmgPorExecucao({ empenhadoCents: 1, utilizadoCents: 1, pagoCents: 0 })).toBe("liquidada");
    expect(statusAlmgPorExecucao({ empenhadoCents: 1, utilizadoCents: 0, pagoCents: 0 })).toBe("empenhada");
    expect(statusAlmgPorExecucao({ empenhadoCents: 0, utilizadoCents: 0, pagoCents: 0 })).toBe("indicada");
  });
});

describe("ehReprovada", () => {
  it("pega 'REPROVADO PELO ÓRGÃO'", () => {
    expect(ehReprovada("REPROVADO PELO ÓRGÃO")).toBe(true);
    expect(ehReprovada("APROVADO")).toBe(false);
  });
});

describe("extrairEmendasDoAutor", () => {
  const linhas = parsearCsvPontoEVirgula(CSV);

  it("casa autor ignorando acento/caixa e ignora reprovada + outro autor", () => {
    const es = extrairEmendasDoAutor(linhas, "Mauro Tramonte");
    // 2 aprovadas do Tramonte; reprovada e ADALCLEVER ficam de fora
    expect(es.length).toBe(2);
    expect(es.every((e) => /TRAMONTE/.test(e.autor ?? ""))).toBe(true);
  });

  it("mapeia valores, status e campos da emenda paga", () => {
    const es = extrairEmendasDoAutor(linhas, "MAURO TRAMONTE");
    const paga = es.find((e) => e.numero === "23933")!;
    expect(paga.ano).toBe(2020);
    expect(paga.pagoCents).toBe(6_400_000);
    expect(statusAlmgPorExecucao(paga)).toBe("paga");
    expect(paga.municipio).toBe("BELO HORIZONTE");
    expect(paga.funcao).toBe("SEGURANÇA PÚBLICA");
  });

  it("emenda só-empenhada vira status empenhada", () => {
    const es = extrairEmendasDoAutor(linhas, "MAURO TRAMONTE");
    const emp = es.find((e) => e.numero === "24010")!;
    expect(emp.empenhadoCents).toBe(1_000_000);
    expect(emp.pagoCents).toBe(0);
    expect(statusAlmgPorExecucao(emp)).toBe("empenhada");
  });

  it("autor inexistente devolve zero (controle negativo)", () => {
    expect(extrairEmendasDoAutor(linhas, "Fulano de Tal").length).toBe(0);
  });
});

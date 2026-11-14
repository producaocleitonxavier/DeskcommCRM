import { describe, expect, it } from "vitest";

import { instrucoesDoDocumentoDaCasa, instrucoesDoRequerimento, montarPedidoDoDocumentoDaCasa } from "./redacao-oficial";

describe("documentos da Casa — o nome é do gabinete, a regra não é de Casa nenhuma", () => {
  it("visita técnica e audiência usam o padrão do requerimento que já existia", () => {
    expect(instrucoesDoDocumentoDaCasa("pedido_comissao", "visita_tecnica")).toBe(instrucoesDoRequerimento("visita_tecnica"));
    expect(instrucoesDoDocumentoDaCasa("pedido_comissao", "audiencia_publica")).toBe(instrucoesDoRequerimento("audiencia_publica"));
  });

  it("cada função tem estrutura própria e todas proíbem inventar dado e prometer", () => {
    const p = instrucoesDoDocumentoDaCasa("providencia");
    const i = instrucoesDoDocumentoDaCasa("informacao");
    const m = instrucoesDoDocumentoDaCasa("manifestacao");
    expect(p).toContain("JUSTIFICATIVA");
    expect(i).toContain("uma por linha");
    expect(m).toContain("seja dada ciência");
    const h = instrucoesDoDocumentoDaCasa("homenagem");
    expect(h).toContain("Não invente biografia");
    for (const t of [p, i, m, h, instrucoesDoDocumentoDaCasa("pedido_comissao", "seminário")]) {
      expect(t).toContain("NUNCA invente dado");
      expect(t).toContain("nunca promete resultado");
    }
  });

  it("nenhuma regra de uma Casa específica está no texto fixo", () => {
    const tudo = (["pedido_comissao", "providencia", "informacao", "manifestacao", "homenagem"] as const)
      .map((f) => instrucoesDoDocumentoDaCasa(f, "outro"))
      .join("\n");
    expect(tudo).not.toMatch(/Belo Horizonte|Contagem|art\. ?\d|30 dias|20 por mês/i);
  });

  it("o pedido leva o nome que o gabinete usa e só os dados informados", () => {
    const t = montarPedidoDoDocumentoDaCasa({
      funcao: "providencia",
      rotulo: "Indicação",
      assunto: "Tapa-buraco na Rua A",
      destinatario: "Prefeita Municipal",
      local: "Rua A, 10, Centro",
    });
    expect(t).toContain("Nome do documento nesta Casa: Indicação");
    expect(t).toContain("Local (copie exatamente): Rua A, 10, Centro");
    expect(t).not.toContain("Dispositivo");
    expect(t).not.toContain("Cidade:");
  });

  it("visita técnica nascida do zero leva a comissão como destinatário", () => {
    const t = montarPedidoDoDocumentoDaCasa({
      funcao: "pedido_comissao",
      rotulo: "Requerimento de comissão",
      subtipo: "visita_tecnica",
      assunto: "Erosão na encosta",
      destinatario: "Comissão de Meio Ambiente",
      orientacao: "citar o laudo da Defesa Civil",
    });
    expect(t).toContain("Comissão: Comissão de Meio Ambiente");
    expect(t).toContain("citar o laudo da Defesa Civil");
  });
  it("pedido a comissão com outro pedido digitado leva esse pedido para a IA", () => {
    const t = montarPedidoDoDocumentoDaCasa({
      funcao: "pedido_comissao",
      rotulo: "Requerimento de comissão",
      subtipo: "seminário sobre mobilidade",
      assunto: "Ciclovias",
      destinatario: "Comissão de Mobilidade",
    });
    expect(t).toContain("Providência pedida à comissão: seminário sobre mobilidade");
  });
  it("homenagem: leva a honraria e a data da cerimônia; data e local de demanda NÃO entram", () => {
    const t = montarPedidoDoDocumentoDaCasa({
      funcao: "homenagem",
      rotulo: "Homenagem",
      subtipo: "Diploma de honra ao mérito",
      assunto: "Dona Maria",
      cerimonia: "10 de dezembro de 2026",
      quando: "4 de outubro de 2026, às 21 horas",
      local: "Rua A, 10",
    });
    expect(t).toContain("Honraria: Diploma de honra ao mérito");
    expect(t).toContain("Data da cerimônia (copie exatamente): 10 de dezembro de 2026");
    expect(t).not.toContain("4 de outubro");
    expect(t).not.toContain("Rua A, 10");
  });
});

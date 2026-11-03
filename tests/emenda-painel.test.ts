import { describe, expect, it } from "vitest";

import { derivarPainel, grauDoDestino, type EmendaLite } from "@/lib/politico/emenda-painel";

/** Dataset de deputado: destino = município, região = meso-região. */
const DEPUTADO: EmendaLite[] = [
  { id: "1", ano: 2025, status: "paga", area: "saude", municipio: "Betim", bairro: null, mesoRegiao: "Metropolitana", modalidade: "Convênio", valorIndicadoCents: 100_000, valorPagoCents: 100_000 },
  { id: "2", ano: 2025, status: "indicada", area: "saude", municipio: "Betim", bairro: null, mesoRegiao: "Metropolitana", modalidade: "Resolução", valorIndicadoCents: 50_000, valorPagoCents: 0 },
  { id: "3", ano: 2024, status: "empenhada", area: "educacao", municipio: "Contagem", bairro: null, mesoRegiao: "Metropolitana", modalidade: "Convênio", valorIndicadoCents: 80_000, valorPagoCents: 20_000 },
  { id: "4", ano: 2026, status: "paga", area: "saude", municipio: "Poços de Caldas", bairro: null, mesoRegiao: "Sul", modalidade: "Resolução", valorIndicadoCents: 60_000, valorPagoCents: 60_000 },
  // PEDIDO — não é dinheiro nem indicação:
  { id: "5", ano: 2026, status: "solicitada", area: "saude", municipio: "Uberaba", bairro: null, mesoRegiao: "Triângulo", modalidade: null, valorIndicadoCents: 999_999, valorPagoCents: 0 },
  // RASCUNHO — idem:
  { id: "6", ano: 2026, status: "rascunho", area: "cultura", municipio: "Juiz de Fora", bairro: null, mesoRegiao: "Zona da Mata", modalidade: null, valorIndicadoCents: 777, valorPagoCents: 0 },
];

/** Dataset de vereador: destino = bairro. */
const VEREADOR: EmendaLite[] = [
  { id: "v1", ano: 2025, status: "paga", area: "saude", municipio: "Belo Horizonte", bairro: "Centro", mesoRegiao: null, modalidade: "Emenda Impositiva", valorIndicadoCents: 40_000, valorPagoCents: 40_000 },
  { id: "v2", ano: 2025, status: "indicada", area: "educacao", municipio: "Belo Horizonte", bairro: "Centro", mesoRegiao: null, modalidade: "Emenda Impositiva", valorIndicadoCents: 30_000, valorPagoCents: 0 },
  { id: "v3", ano: 2024, status: "paga", area: "saude", municipio: "Belo Horizonte", bairro: "Savassi", mesoRegiao: null, modalidade: "Emenda Impositiva", valorIndicadoCents: 20_000, valorPagoCents: 20_000 },
];

describe("grauDoDestino — a lente muda com o mandato", () => {
  it("deputado olha por município", () => {
    expect(grauDoDestino("dep_estadual")).toBe("municipio");
    expect(grauDoDestino("dep_federal")).toBe("municipio");
  });
  it("vereador/prefeito olham por bairro", () => {
    expect(grauDoDestino("vereador")).toBe("bairro");
    expect(grauDoDestino("prefeito")).toBe("bairro");
  });
});

describe("derivarPainel — KPIs e exclusão de pedidos/rascunhos", () => {
  it("conta indicações excluindo 'solicitada' e 'rascunho'", () => {
    const p = derivarPainel(DEPUTADO, "dep_estadual");
    expect(p.kpis.totalIndicacoes).toBe(4);
  });

  it("destinos atendidos = municípios distintos (deputado)", () => {
    const p = derivarPainel(DEPUTADO, "dep_estadual");
    // Betim (x2) + Contagem + Poços = 3 municípios decididos (Uberaba é pedido).
    expect(p.kpis.destinosAtendidos).toBe(3);
  });

  it("MESMOS dados, lente de vereador conta por BAIRRO, não por município", () => {
    const p = derivarPainel(VEREADOR, "vereador");
    // Centro (x2) + Savassi = 2 bairros; se contasse município daria 1.
    expect(p.kpis.destinosAtendidos).toBe(2);
  });

  it("ANTI-TAUTOLOGIA: 'solicitada' NÃO infla o valor total indicado", () => {
    const p = derivarPainel(DEPUTADO, "dep_estadual");
    const somaDecididas = 100_000 + 50_000 + 80_000 + 60_000;
    const somaIngenua = somaDecididas + 999_999 + 777; // se somasse tudo
    expect(p.kpis.valorTotalIndicadoCents).toBe(somaDecididas);
    expect(p.kpis.valorTotalIndicadoCents).not.toBe(somaIngenua);
    // E provando que a exclusão é real: adicionar OUTRO pedido não muda o total.
    const comMaisUmPedido = derivarPainel(
      [...DEPUTADO, { id: "7", ano: 2026, status: "solicitada", area: "saude", municipio: "Uberlândia", bairro: null, mesoRegiao: "Triângulo", modalidade: null, valorIndicadoCents: 500_000, valorPagoCents: 0 }],
      "dep_estadual",
    );
    expect(comMaisUmPedido.kpis.valorTotalIndicadoCents).toBe(somaDecididas);
  });

  it("financeiro: pendente = alocado - pago", () => {
    const p = derivarPainel(DEPUTADO, "dep_estadual");
    expect(p.financeiro.alocadoCents).toBe(290_000);
    expect(p.financeiro.executadoCents).toBe(180_000);
    expect(p.financeiro.pendenteCents).toBe(110_000);
  });

  it("conta pedidos aguardando (apenas 'solicitada')", () => {
    const p = derivarPainel(DEPUTADO, "dep_estadual");
    expect(p.pedidosAguardando).toBe(1);
  });
});

describe("derivarPainel — agrupamentos", () => {
  it("porAno vem ordenado crescente e soma só decididas", () => {
    const p = derivarPainel(DEPUTADO, "dep_estadual");
    expect(p.porAno.map((a) => a.ano)).toEqual([2024, 2025, 2026]);
    expect(p.porAno.find((a) => a.ano === 2025)?.valorCents).toBe(150_000);
    expect(p.porAno.find((a) => a.ano === 2026)?.valorCents).toBe(60_000); // pedido/rascunho de 2026 fora
  });

  it("porArea vem ordenado por valor (maior primeiro)", () => {
    const p = derivarPainel(DEPUTADO, "dep_estadual");
    expect(p.porArea[0]).toEqual({ nome: "saude", valorCents: 210_000 });
    expect(p.porArea[1]).toEqual({ nome: "educacao", valorCents: 80_000 });
  });

  it("porRegiao: deputado agrupa por meso-região, Top 6", () => {
    const p = derivarPainel(DEPUTADO, "dep_estadual");
    expect(p.porRegiao[0]).toEqual({ nome: "Metropolitana", valorCents: 230_000 });
    expect(p.porRegiao.length).toBeLessThanOrEqual(6);
  });

  it("porRegiao: vereador agrupa por BAIRRO", () => {
    const p = derivarPainel(VEREADOR, "vereador");
    expect(p.porRegiao[0]).toEqual({ nome: "Centro", valorCents: 70_000 });
    expect(p.porRegiao[1]).toEqual({ nome: "Savassi", valorCents: 20_000 });
  });
});

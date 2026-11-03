import { describe, expect, it } from "vitest";

import {
  cruzarEmendaVoto,
  normalizarChave,
  resumoInvestimentoVsVoto,
  temDadosDeVoto,
  type DestinoComValor,
  type VotoNoDestino,
} from "@/lib/politico/emenda-votos";

/** Deputado: destinos por município (chave = ibge), com total válido → dá o %. */
const DESTINOS: DestinoComValor[] = [
  { chave: "3106200", rotulo: "Betim", valorIndicadoCents: 150_000 },
  { chave: "3118601", rotulo: "Contagem", valorIndicadoCents: 80_000 },
  { chave: "3151800", rotulo: "Poços de Caldas", valorIndicadoCents: 60_000 },
];
const VOTOS: VotoNoDestino[] = [
  { chave: "3106200", votos: 500, total: 10_000 }, // pouco voto → oportunidade
  { chave: "3118601", votos: 5_000, total: 10_000 }, // muito voto → fortaleza
  // Poços ausente → sem dado de voto (fail-soft).
];

describe("cruzarEmendaVoto — cruzamento emenda × voto", () => {
  it("destino com voto recebe votos, % e leitura", () => {
    const c = cruzarEmendaVoto(DESTINOS, VOTOS);
    const betim = c.find((x) => x.chave === "3106200")!;
    expect(betim.votos).toBe(500);
    expect(betim.pctVotos).toBe(5); // 500/10000*100
    expect(betim.leitura).toBe("oportunidade");
  });

  it("calcula % com 1 casa decimal", () => {
    const c = cruzarEmendaVoto(DESTINOS, VOTOS);
    expect(c.find((x) => x.chave === "3118601")!.pctVotos).toBe(50);
    expect(c.find((x) => x.chave === "3118601")!.leitura).toBe("fortaleza");
  });

  it("FAIL-SOFT: destino sem voto conhecido vem null (não quebra, não inventa)", () => {
    const c = cruzarEmendaVoto(DESTINOS, VOTOS);
    const pocos = c.find((x) => x.chave === "3151800")!;
    expect(pocos.votos).toBeNull();
    expect(pocos.pctVotos).toBeNull();
    expect(pocos.leitura).toBeNull();
  });

  it("CONTROLE NEGATIVO: TSE vazio → nenhum dado de voto, coluna some", () => {
    const c = cruzarEmendaVoto(DESTINOS, []);
    expect(c.every((x) => x.votos === null)).toBe(true);
    expect(temDadosDeVoto(c)).toBe(false);
  });

  it("temDadosDeVoto true quando há ao menos um destino com voto", () => {
    expect(temDadosDeVoto(cruzarEmendaVoto(DESTINOS, VOTOS))).toBe(true);
  });

  it("ordena por valor investido (maior primeiro)", () => {
    const c = cruzarEmendaVoto(DESTINOS, VOTOS);
    expect(c.map((x) => x.rotulo)).toEqual(["Betim", "Contagem", "Poços de Caldas"]);
  });

  it("ANTI-TAUTOLOGIA: trocar os votos troca a leitura (não é fixo por posição)", () => {
    const votosTrocados: VotoNoDestino[] = [
      { chave: "3106200", votos: 5_000, total: 10_000 }, // agora Betim vota muito
      { chave: "3118601", votos: 500, total: 10_000 }, // agora Contagem vota pouco
    ];
    const c = cruzarEmendaVoto(DESTINOS, votosTrocados);
    expect(c.find((x) => x.chave === "3106200")!.leitura).toBe("fortaleza");
    expect(c.find((x) => x.chave === "3118601")!.leitura).toBe("oportunidade");
  });

  it("vereador: voto por bairro sem total → tem voto e leitura, mas % null", () => {
    const destinos: DestinoComValor[] = [
      { chave: "centro", rotulo: "Centro", valorIndicadoCents: 40_000 },
      { chave: "savassi", rotulo: "Savassi", valorIndicadoCents: 20_000 },
    ];
    const votos: VotoNoDestino[] = [
      { chave: "centro", votos: 1_200 },
      { chave: "savassi", votos: 100 },
    ];
    const c = cruzarEmendaVoto(destinos, votos);
    const centro = c.find((x) => x.chave === "centro")!;
    expect(centro.votos).toBe(1_200);
    expect(centro.pctVotos).toBeNull(); // sem total, não dá %
    expect(centro.leitura).toBe("fortaleza");
    expect(c.find((x) => x.chave === "savassi")!.leitura).toBe("oportunidade");
  });
});

describe("resumoInvestimentoVsVoto — onde investi × onde votei", () => {
  it("soma valor por leitura (oportunidade vs fortaleza)", () => {
    const r = resumoInvestimentoVsVoto(cruzarEmendaVoto(DESTINOS, VOTOS));
    expect(r.temDados).toBe(true);
    expect(r.nOportunidade).toBe(1);
    expect(r.valorOportunidadeCents).toBe(150_000); // Betim
    expect(r.nFortaleza).toBe(1);
    expect(r.valorFortalezaCents).toBe(80_000); // Contagem
  });

  it("sem dados TSE → resumo zerado e temDados false", () => {
    const r = resumoInvestimentoVsVoto(cruzarEmendaVoto(DESTINOS, []));
    expect(r.temDados).toBe(false);
    expect(r.valorOportunidadeCents).toBe(0);
    expect(r.valorFortalezaCents).toBe(0);
  });
});

describe("normalizarChave — casa nomes de bairro apesar de acento/caixa", () => {
  it("minúsculo, sem acento, espaços colapsados", () => {
    expect(normalizarChave("  São   JOÃO  ")).toBe("sao joao");
    expect(normalizarChave("Céu Azul")).toBe("ceu azul");
  });
});

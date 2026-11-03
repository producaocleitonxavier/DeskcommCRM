import { describe, expect, it } from "vitest";

import { funcaoParaArea } from "@/lib/politico/gov-funcao-area";
import { pagoEfetivoCents } from "@/lib/politico/gov-emendas";

describe("funcaoParaArea — função oficial do gov → área do GIP", () => {
  it("Saúde → saude", () => {
    expect(funcaoParaArea("Saúde")).toBe("saude");
  });
  it("Educação → educacao", () => {
    expect(funcaoParaArea("Educação")).toBe("educacao");
  });
  it("Segurança Pública → seguranca", () => {
    expect(funcaoParaArea("Segurança Pública")).toBe("seguranca");
  });
  it("Assistência social → assistencia_social (e não cai em outro genérico)", () => {
    expect(funcaoParaArea("Assistência social")).toBe("assistencia_social");
  });
  it("Cultura → cultura", () => {
    expect(funcaoParaArea("Cultura")).toBe("cultura");
  });
  it("Desporto e Lazer → esporte", () => {
    expect(funcaoParaArea("Desporto e Lazer")).toBe("esporte");
  });
  it("Gestão Ambiental → meio_ambiente", () => {
    expect(funcaoParaArea("Gestão Ambiental")).toBe("meio_ambiente");
  });
  it("Agricultura e Organização Agrária → agricultura", () => {
    expect(funcaoParaArea("Agricultura")).toBe("agricultura");
    expect(funcaoParaArea("Organização Agrária")).toBe("agricultura");
  });
  it("Ciência e Tecnologia → tecnologia", () => {
    expect(funcaoParaArea("Ciência e Tecnologia")).toBe("tecnologia");
  });
  it("Urbanismo / Saneamento / Transporte / Habitação → infraestrutura", () => {
    expect(funcaoParaArea("Urbanismo")).toBe("infraestrutura");
    expect(funcaoParaArea("Saneamento")).toBe("infraestrutura");
    expect(funcaoParaArea("Transporte")).toBe("infraestrutura");
    expect(funcaoParaArea("Habitação")).toBe("infraestrutura");
  });

  // Controle negativo: função desconhecida/não-temática cai em "outro".
  it("Legislativa / Administração / Encargos Especiais / vazio → outro", () => {
    expect(funcaoParaArea("Legislativa")).toBe("outro");
    expect(funcaoParaArea("Administração")).toBe("outro");
    expect(funcaoParaArea("Encargos Especiais")).toBe("outro");
    expect(funcaoParaArea("")).toBe("outro");
    expect(funcaoParaArea(null)).toBe("outro");
    expect(funcaoParaArea(undefined)).toBe("outro");
  });

  // Anti-tautologia: a classificação depende MESMO do texto, não é "saude" fixo.
  it("ANTI-TAUTOLOGIA: Urbanismo é infraestrutura e NÃO saude", () => {
    expect(funcaoParaArea("Urbanismo")).toBe("infraestrutura");
    expect(funcaoParaArea("Urbanismo")).not.toBe("saude");
    expect(funcaoParaArea("Segurança Pública")).not.toBe("saude");
  });

  it("tolera acento/caixa/espaços extras", () => {
    expect(funcaoParaArea("  SAÚDE  ")).toBe("saude");
    expect(funcaoParaArea("seguranca publica")).toBe("seguranca");
  });
});

describe("pagoEfetivoCents — pago no ano + pago via restos", () => {
  it("soma pago + restoPago", () => {
    expect(pagoEfetivoCents({ pagoCents: 73400, restoPagoCents: 2246582 })).toBe(2319982);
  });

  it("restos zerados → pago = pago (sem efeito colateral)", () => {
    expect(pagoEfetivoCents({ pagoCents: 1000000, restoPagoCents: 0 })).toBe(1000000);
  });

  it("CASO REAL (Ricardo Barros): restoPago DOMINA — ignorar restos daria número errado", () => {
    const e = { pagoCents: 73400, restoPagoCents: 2246582 }; // R$734 no ano + R$22.465 restos
    const efetivo = pagoEfetivoCents(e);
    expect(efetivo).toBe(2319982); // R$23.199,82
    // Prova de que ignorar os restos subestima brutalmente:
    expect(e.pagoCents).toBeLessThan(efetivo);
    expect(efetivo / Math.max(e.pagoCents, 1)).toBeGreaterThan(30); // >30x maior
  });

  it("tolera campos ausentes (fail-soft)", () => {
    expect(pagoEfetivoCents({ pagoCents: 0, restoPagoCents: 0 })).toBe(0);
  });
});

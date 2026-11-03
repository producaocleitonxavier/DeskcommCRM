import { describe, it, expect } from "vitest";

import { classificarArea, rotuloArea } from "@/lib/politico/emenda-classificar";

describe("classificarArea — um ramo por área", () => {
  it("saúde", () => {
    expect(classificarArea("Custeio da UPA de Venda Nova")).toBe("saude");
    expect(classificarArea("Aparelho de hemodiálise para o hospital")).toBe("saude");
  });
  it("educação", () => {
    expect(classificarArea("Reforma da Escola Municipal do Pampulha")).toBe("educacao");
    expect(classificarArea("Mobiliário escolar e merenda")).toBe("educacao");
  });
  it("segurança", () => {
    expect(classificarArea("Aquisição de viatura para a Polícia Militar")).toBe("seguranca");
    expect(classificarArea("Drone e defesa civil")).toBe("seguranca");
  });
  it("esporte", () => {
    expect(classificarArea("Campo de futebol do Barreiro")).toBe("esporte");
    expect(classificarArea("Academia ao ar livre na praça")).toBe("esporte");
  });
  it("cultura", () => {
    expect(classificarArea("Barracas para a feira gastronômica")).toBe("cultura");
  });
  it("assistência social", () => {
    expect(classificarArea("Casa da Criança com acolhimento")).toBe("assistencia_social");
    expect(classificarArea("APAE e lar dos idosos")).toBe("assistencia_social");
  });
  it("infraestrutura", () => {
    expect(classificarArea("Pavimentação da rua e mata-burro")).toBe("infraestrutura");
  });
  it("agricultura", () => {
    expect(classificarArea("Trator e kit irrigação para o produtor rural")).toBe("agricultura");
  });
  it("sem casamento → outro", () => {
    expect(classificarArea("qwerty zxcvb algo sem palavra conhecida")).toBe("outro");
    expect(classificarArea("")).toBe("outro");
  });
});

describe("classificarArea — anti-tautologia (depende do TEXTO e da ORDEM, não é constante)", () => {
  it("'câncer' (saúde) vence 'campo' (esporte) quando os dois aparecem", () => {
    // Se fosse constante, campo de futebol e câncer dariam o mesmo. Não dão:
    expect(classificarArea("campo de futebol")).toBe("esporte");
    expect(classificarArea("custeio de campo para criança com câncer")).toBe("saude");
  });
  it("trocar o conteúdo troca a área — prova que não é fixo", () => {
    const a = classificarArea("viatura da polícia");
    const b = classificarArea("reforma da creche");
    expect(a).toBe("seguranca");
    expect(b).toBe("educacao");
    expect(a).not.toBe(b);
  });
  it("tolera acento, caixa e espaços", () => {
    expect(classificarArea("  HOSPITAL   Municipal  ")).toBe("saude");
    expect(classificarArea("Pavimentação")).toBe("infraestrutura");
  });
});

describe("rotuloArea", () => {
  it("devolve rótulo amigável", () => {
    expect(rotuloArea("saude")).toBe("Saúde");
    expect(rotuloArea("assistencia_social")).toBe("Assistência social");
  });
  it("chave desconhecida volta como veio", () => {
    expect(rotuloArea("inexistente")).toBe("inexistente");
  });
});

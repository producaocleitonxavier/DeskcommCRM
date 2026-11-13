import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { chaveDaCidade, municipioDaCidade } from "./mandato-padrao";

const municipios = [
  { tse: "41238", nome: "BELO HORIZONTE" },
  { tse: "43710", nome: "CONTAGEM" },
  { tse: "50000", nome: "SÃO JOÃO DEL REI" },
];

describe("município da cidade do gabinete", () => {
  it("casa ignorando acento, caixa e UF", () => {
    expect(municipioDaCidade("Belo Horizonte", municipios)).toBe("41238");
    expect(municipioDaCidade("belo horizonte - MG", municipios)).toBe("41238");
    expect(municipioDaCidade("Belo Horizonte/MG", municipios)).toBe("41238");
    expect(municipioDaCidade("Sao Joao del Rei", municipios)).toBe("50000");
  });

  it("controle negativo: cidade vazia ou desconhecida não escolhe nada", () => {
    expect(municipioDaCidade("", municipios)).toBeNull();
    expect(municipioDaCidade(null, municipios)).toBeNull();
    expect(municipioDaCidade("Betim", municipios)).toBeNull();
    expect(municipioDaCidade("Belo", municipios)).toBeNull();
  });

  it("a chave não confunde cidades de nome parecido", () => {
    expect(chaveDaCidade("Contagem")).toBe("CONTAGEM");
    expect(chaveDaCidade("Contagem - MG")).toBe("CONTAGEM");
    expect(chaveDaCidade("Santa Rita de Caldas")).not.toBe(chaveDaCidade("Santa Rita do Sapucaí"));
  });
});

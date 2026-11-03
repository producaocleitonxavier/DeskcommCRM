import { describe, it, expect } from "vitest";

import { grupoSituacao, autoriaEhColetiva, autoriaLabel, GRUPOS_SITUACAO } from "@/lib/politico/projeto-lei";

describe("projeto-lei — grupoSituacao (11 status → 5 grupos)", () => {
  it("promulgado → virou_lei (a vitória)", () => {
    expect(grupoSituacao("promulgado")).toBe("virou_lei");
  });
  it("comissões", () => {
    expect(grupoSituacao("em_comissao")).toBe("comissoes");
    expect(grupoSituacao("aprovado_comissao")).toBe("comissoes");
  });
  it("votação (plenário/aprovado)", () => {
    expect(grupoSituacao("em_plenario")).toBe("votacao");
    expect(grupoSituacao("aprovado")).toBe("votacao");
  });
  it("encerrado (vetado/arquivado/retirado)", () => {
    for (const s of ["vetado", "arquivado", "retirado"]) expect(grupoSituacao(s)).toBe("encerrado");
  });
  it("tramitação (rascunho/apresentado/em_tramitacao e desconhecido)", () => {
    for (const s of ["rascunho", "apresentado", "em_tramitacao", "qualquer_coisa"]) {
      expect(grupoSituacao(s)).toBe("tramitacao");
    }
  });
  it("ANTI-TAUTOLOGIA: em_comissao NÃO é virou_lei e promulgado NÃO é tramitação", () => {
    expect(grupoSituacao("em_comissao")).not.toBe("virou_lei");
    expect(grupoSituacao("promulgado")).not.toBe("tramitacao");
  });
  it("GRUPOS_SITUACAO cobre os 5 grupos sem repetir", () => {
    expect(new Set(GRUPOS_SITUACAO.map((g) => g.grupo)).size).toBe(5);
  });
});

describe("projeto-lei — autoria", () => {
  it("coautor real → coletiva", () => {
    expect(autoriaEhColetiva(["Vereadora Fulana"])).toBe(true);
    expect(autoriaLabel(["Vereadora Fulana"])).toBe("Coautoria");
  });
  it("sem coautor → única (controle negativo: vazio/nulo/só espaço)", () => {
    expect(autoriaEhColetiva([])).toBe(false);
    expect(autoriaEhColetiva(null)).toBe(false);
    expect(autoriaEhColetiva(undefined)).toBe(false);
    expect(autoriaEhColetiva(["", "   "])).toBe(false);
    expect(autoriaLabel([])).toBe("Autoria única");
  });
});

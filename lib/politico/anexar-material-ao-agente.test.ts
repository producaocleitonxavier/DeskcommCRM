import { describe, expect, it } from "vitest";

import { planejarAnexo, type VersaoResumo } from "./anexar-material-ao-agente";

const M = "material-novo";
const v = (id: string, n: number, status: string, fontes: string[] = ["base"]): VersaoResumo => ({ id, version_number: n, status, knowledge_source_ids: fontes });

describe("planejarAnexo — material aprovado tem de chegar em QUEM ATENDE", () => {
  it("versão publicada sem o material → versão nova (publicada não se edita)", () => {
    expect(planejarAnexo([v("a", 12, "superseded"), v("b", 13, "published")], M)).toEqual({ tipo: "nova_versao", origemId: "b", rascunhoParaAlinharId: null });
  });

  it("o caso do Cleiton em 12/nov: a mais recente É a publicada — nunca 'editar'", () => {
    const plano = planejarAnexo([v("b", 13, "published")], M);
    expect(plano.tipo).toBe("nova_versao");
  });

  it("publicada já tem o material → nada a fazer", () => {
    expect(planejarAnexo([v("b", 13, "published", ["base", M])], M)).toEqual({ tipo: "ja_anexado" });
  });

  it("sem publicada: entra no rascunho mais novo", () => {
    expect(planejarAnexo([v("r1", 1, "draft"), v("r2", 2, "draft")], M)).toEqual({ tipo: "editar_rascunho", versaoId: "r2" });
    expect(planejarAnexo([v("r2", 2, "draft", [M])], M)).toEqual({ tipo: "ja_anexado" });
  });

  it("publicada + rascunho mais novo sem o material: publica versão nova E alinha o rascunho", () => {
    expect(planejarAnexo([v("b", 13, "published"), v("r", 14, "draft")], M)).toEqual({ tipo: "nova_versao", origemId: "b", rascunhoParaAlinharId: "r" });
  });

  it("rascunho mais ANTIGO que a publicada não é tocado", () => {
    expect(planejarAnexo([v("r", 12, "draft"), v("b", 13, "published")], M)).toEqual({ tipo: "nova_versao", origemId: "b", rascunhoParaAlinharId: null });
  });

  it("controle negativo: agente sem versão (ou só versões antigas) não inventa destino", () => {
    expect(planejarAnexo([], M)).toEqual({ tipo: "sem_versao" });
    expect(planejarAnexo([v("a", 1, "superseded")], M)).toEqual({ tipo: "sem_versao" });
  });

  it("lista de fontes nula é tratada como vazia", () => {
    expect(planejarAnexo([{ id: "b", version_number: 1, status: "published", knowledge_source_ids: null }], M).tipo).toBe("nova_versao");
  });
});

import { describe, expect, it } from "vitest";

import {
  configDoRequerimentoDeSettings,
  problemaDoTextoDoRequerimento,
  temLacuna,
  tituloDoRequerimento,
} from "./requerimento-pdf";

describe("requerimento em PDF — regras", () => {
  it("título por tipo", () => {
    expect(tituloDoRequerimento("visita_tecnica")).toBe("REQUERIMENTO DE VISITA TÉCNICA");
    expect(tituloDoRequerimento("audiencia_publica")).toBe("REQUERIMENTO DE AUDIÊNCIA PÚBLICA");
  });

  it("lacuna entre colchetes é detectada; colchete curto ou vazio não", () => {
    expect(temLacuna("ponto de encontro na [LOGRADOURO, NÚMERO, BAIRRO]")).toBe(true);
    expect(temLacuna("• [ÓRGÃOS A CONVIDAR]")).toBe(true);
    expect(temLacuna("conforme o art. 48 [1] do regimento")).toBe(false);
    expect(temLacuna("Senhor Presidente,")).toBe(false);
  });

  it("texto vazio, longo demais ou com lacuna não vira PDF", () => {
    expect(problemaDoTextoDoRequerimento("")).toContain("Redija");
    expect(problemaDoTextoDoRequerimento("   ")).toContain("Redija");
    expect(problemaDoTextoDoRequerimento(null)).toContain("Redija");
    expect(problemaDoTextoDoRequerimento("a".repeat(12001))).toContain("longo demais");
    expect(problemaDoTextoDoRequerimento("Requeiro visita na [RUA]")).toContain("COLCHETES");
  });

  it("texto revisado passa", () => {
    expect(problemaDoTextoDoRequerimento("Senhor Presidente,\n\nRequeiro a esta Comissão a realização de visita técnica.")).toBeNull();
  });

  it("configuração guardada: lê o que existe e degrada para vazio", () => {
    expect(
      configDoRequerimentoDeSettings({ gabinete: { requerimento: { comissao: " Comissão de Saúde ", dispositivo: "art. 48" } } }),
    ).toEqual({ comissao: "Comissão de Saúde", dispositivo: "art. 48" });
    expect(configDoRequerimentoDeSettings({ gabinete: { modo_campanha: true } })).toEqual({ comissao: "", dispositivo: "" });
    expect(configDoRequerimentoDeSettings({ gabinete: { requerimento: { comissao: 7 } } })).toEqual({ comissao: "", dispositivo: "" });
    expect(configDoRequerimentoDeSettings(null)).toEqual({ comissao: "", dispositivo: "" });
    expect(configDoRequerimentoDeSettings("x")).toEqual({ comissao: "", dispositivo: "" });
  });
});

import { enterEmLista, lacunasDoTexto } from "./requerimento-pdf";

describe("requerimento — ajudas de edição", () => {
  it("lista as lacunas com a posição", () => {
    const t = "na [RUA E NÚMERO], com [ÓRGÃOS A CONVIDAR].";
    const l = lacunasDoTexto(t);
    expect(l.map((x) => x.trecho)).toEqual(["[RUA E NÚMERO]", "[ÓRGÃOS A CONVIDAR]"]);
    expect(t.slice(l[0]!.inicio, l[0]!.fim)).toBe("[RUA E NÚMERO]");
    expect(lacunasDoTexto("sem nada")).toEqual([]);
  });

  it("Enter no fim de uma linha de lista cria a próxima com marcador", () => {
    const t = "órgãos:\n• Secretaria de Obras;";
    const r = enterEmLista(t, t.length, t.length);
    expect(r).toEqual({ texto: "órgãos:\n• Secretaria de Obras;\n• ", cursor: t.length + 3 });
  });

  it("Enter numa linha só com o marcador encerra a lista", () => {
    const t = "• Secretaria de Obras;\n• ";
    const r = enterEmLista(t, t.length, t.length);
    expect(r).toEqual({ texto: "• Secretaria de Obras;\n", cursor: "• Secretaria de Obras;\n".length });
  });

  it("Enter fora de lista segue normal", () => {
    expect(enterEmLista("Senhor Presidente,", 18, 18)).toBeNull();
    expect(enterEmLista("• item\ntexto comum", 18, 18)).toBeNull();
  });

  it("Enter no meio de uma linha de lista quebra em dois itens", () => {
    const t = "• Obras; Saúde;";
    const r = enterEmLista(t, 9, 9);
    expect(r?.texto).toBe("• Obras; \n• Saúde;");
  });
});

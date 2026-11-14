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

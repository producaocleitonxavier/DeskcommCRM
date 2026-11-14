import { describe, expect, it } from "vitest";

import { dataPorExtenso } from "./oficio-pdf";

describe("data do documento — sempre no horário de Brasília", () => {
  it("23h30 de Brasília ainda é o mesmo dia (o servidor roda em UTC)", () => {
    expect(dataPorExtenso("2026-11-15T02:30:00.000Z", "Belo Horizonte")).toBe("Belo Horizonte, 14 de novembro de 2026.");
  });
  it("virada de ano", () => {
    expect(dataPorExtenso("2027-01-01T01:00:00.000Z", null)).toBe("31 de dezembro de 2026.");
  });
  it("meio do dia", () => {
    expect(dataPorExtenso("2026-03-05T15:00:00.000Z", "Contagem")).toBe("Contagem, 5 de março de 2026.");
  });
});

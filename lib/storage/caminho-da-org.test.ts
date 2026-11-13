import { describe, expect, it } from "vitest";

import { caminhoPertenceAOrg } from "./caminho-da-org";

const A = "5f4f8342-0893-42c4-b958-8217bd88122d";
const B = "053ef698-0000-4000-8000-000000000000";

describe("o caminho do arquivo pertence à organização", () => {
  it("aceita o que está debaixo da pasta da própria organização", () => {
    expect(caminhoPertenceAOrg(`${A}/assinatura.png`, A)).toBe(true);
    expect(caminhoPertenceAOrg(`${A}/demanda-1/abc.jpg`, A)).toBe(true);
    expect(caminhoPertenceAOrg(`${A}/relatorios/demandas.pdf`, A)).toBe(true);
  });

  it("recusa o arquivo de outra organização (o ataque da auditoria)", () => {
    expect(caminhoPertenceAOrg(`${B}/assinatura.png`, A)).toBe(false);
    expect(caminhoPertenceAOrg(`${B}/relatorios/demandas.pdf`, A)).toBe(false);
  });

  it("recusa quem tenta sair da pasta", () => {
    expect(caminhoPertenceAOrg(`${A}/../${B}/assinatura.png`, A)).toBe(false);
    expect(caminhoPertenceAOrg(`${A}/./x.png`, A)).toBe(false);
    expect(caminhoPertenceAOrg(`${A}//x.png`, A)).toBe(false);
    expect(caminhoPertenceAOrg(`${A}/x\\..\\y.png`, A)).toBe(false);
    expect(caminhoPertenceAOrg(`${A}x/y.png`, A)).toBe(false);
  });

  it("controle negativo: vazio, nulo ou só a pasta não é arquivo de ninguém", () => {
    expect(caminhoPertenceAOrg(null, A)).toBe(false);
    expect(caminhoPertenceAOrg("", A)).toBe(false);
    expect(caminhoPertenceAOrg(`${A}/`, A)).toBe(false);
    expect(caminhoPertenceAOrg(`${A}/x.png`, "")).toBe(false);
    expect(caminhoPertenceAOrg(`${A}/x.png`, null)).toBe(false);
  });
});

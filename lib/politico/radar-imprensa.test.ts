import { describe, expect, it } from "vitest";

import { citaONome, ehMencaoDeTeste, soTemPerfilComoNome } from "./radar-imprensa";

describe("radar da imprensa: cita o político ou é noticiário da cidade", () => {
  const nomes = ["Cleiton Xavier", "@cleitonxavier"];

  it("notícia achada pela busca do nome cita você", () => {
    expect(citaONome({ titulo: "Câmara aprova projeto", termo: "Cleiton Xavier" }, nomes)).toBe(true);
    expect(citaONome({ titulo: "post", termo: "@cleitonxavier" }, nomes)).toBe(true);
  });

  it("nome no título cita você, com ou sem acento/maiúscula", () => {
    expect(citaONome({ titulo: "Vereador CLEITON XAVIER propõe lei", termo: "segurança" }, nomes)).toBe(true);
    expect(citaONome({ titulo: "Lei de José Antônio avança", termo: "saúde" }, ["Jose Antonio"])).toBe(true);
  });

  it("notícia de tema/cidade NÃO cita você (o caso real: violência em BH)", () => {
    expect(citaONome({ titulo: "Suspeito de violência doméstica é procurado em BH", termo: "violência" }, nomes)).toBe(false);
    expect(citaONome({ titulo: "BH inaugura centro de atendimento", termo: "segurança" }, nomes)).toBe(false);
  });

  it("sem nome monitorado, nada cita você", () => {
    expect(citaONome({ titulo: "Cleiton Xavier fala", termo: "Cleiton Xavier" }, [])).toBe(false);
  });

  it("nome curto não casa por acidente no título", () => {
    expect(citaONome({ titulo: "Banana cara na feira", termo: "feira" }, ["Ana"])).toBe(false);
  });

  it("linha de teste é reconhecida", () => {
    expect(ehMencaoDeTeste({ fonte: "@test" })).toBe(true);
    expect(ehMencaoDeTeste({ fonte: "O TEMPO" })).toBe(false);
    expect(ehMencaoDeTeste({ fonte: null })).toBe(false);
  });

  it("avisa quando o nome monitorado é só @perfil ou uma palavra", () => {
    expect(soTemPerfilComoNome(["@cleitonxavier"])).toBe(true);
    expect(soTemPerfilComoNome(["@cleitonxavier", "Cleiton Xavier"])).toBe(false);
    expect(soTemPerfilComoNome([])).toBe(false);
  });
});

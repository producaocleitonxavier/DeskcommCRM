import { describe, expect, it } from "vitest";

import {
  NIVEIS_DE_RELACIONAMENTO,
  VALORES_DO_MANDATO,
  modoCampanhaLigado,
  nivelAceitoNaEntrada,
  nivelParaExibir,
  niveisVisiveis,
  pluralDoNivel,
  rotuloDoNivel,
  trilhaDosNiveis,
} from "./niveis";

describe("NIVEIS_DE_RELACIONAMENTO — a fonte única", () => {
  it("guarda os 5 valores do banco, na ordem, sem mudar nenhum", () => {
    expect(NIVEIS_DE_RELACIONAMENTO.map((n) => n.value)).toEqual([
      "novo_cadastro",
      "simpatizante",
      "apoiador",
      "militante",
      "voto_certo",
    ]);
  });

  it("os 4 níveis do mandato têm rótulo por comportamento", () => {
    expect(NIVEIS_DE_RELACIONAMENTO.slice(0, 4).map((n) => [n.label, n.plural])).toEqual([
      ["Novo contato", "Novos contatos"],
      ["Em conversa", "Em conversa"],
      ["Participante", "Participantes"],
      ["Multiplicador", "Multiplicadores"],
    ]);
  });

  it("só o voto_certo é de campanha, e chama 'Voto declarado'", () => {
    const deCampanha = NIVEIS_DE_RELACIONAMENTO.filter((n) => n.soCampanha);
    expect(deCampanha).toHaveLength(1);
    expect(deCampanha[0]!.value).toBe("voto_certo");
    expect(deCampanha[0]!.label).toBe("Voto declarado");
    expect(deCampanha[0]!.criterio).toBe("Declarou intenção de voto — só existe em instalação de campanha");
  });

  it("nenhum rótulo do mandato tem cara eleitoral", () => {
    const textos = niveisVisiveis(false).flatMap((n) => [n.label, n.plural, n.criterio]).join(" ");
    expect(textos).not.toMatch(/voto|simpatizante|apoiador|militante|eleitor|funil/i);
  });

  it("todo nível tem critério escrito", () => {
    for (const n of NIVEIS_DE_RELACIONAMENTO) expect(n.criterio.length).toBeGreaterThan(5);
  });

  it("VALORES_DO_MANDATO = os 4 primeiros", () => {
    expect([...VALORES_DO_MANDATO]).toEqual(["novo_cadastro", "simpatizante", "apoiador", "militante"]);
  });
});

describe("modoCampanhaLigado", () => {
  it.each([
    [undefined],
    [null],
    ["texto"],
    [42],
    [{}],
    [{ gabinete: null }],
    [{ gabinete: "sim" }],
    [{ gabinete: {} }],
    [{ gabinete: { modo_campanha: false } }],
    [{ gabinete: { modo_campanha: "true" } }],
    [{ gabinete: { modo_campanha: 1 } }],
    [{ modo_campanha: true }], // fora de `gabinete` não vale
  ])("%o → desligado", (settings) => {
    expect(modoCampanhaLigado(settings)).toBe(false);
  });

  it("só liga com settings.gabinete.modo_campanha === true", () => {
    expect(modoCampanhaLigado({ gabinete: { modo_campanha: true } })).toBe(true);
    expect(modoCampanhaLigado({ outra: 1, gabinete: { setup_completo: true, modo_campanha: true } })).toBe(true);
  });
});

describe("niveisVisiveis", () => {
  it("mandato (desligado) = 4 níveis, sem voto_certo", () => {
    const v = niveisVisiveis(false);
    expect(v).toHaveLength(4);
    expect(v.some((n) => n.value === "voto_certo")).toBe(false);
  });

  it("campanha (ligado) = 5 níveis", () => {
    expect(niveisVisiveis(true).map((n) => n.value)).toEqual([
      "novo_cadastro",
      "simpatizante",
      "apoiador",
      "militante",
      "voto_certo",
    ]);
  });
});

describe("rotuloDoNivel / pluralDoNivel / nivelParaExibir", () => {
  it.each([
    ["novo_cadastro", "Novo contato"],
    ["simpatizante", "Em conversa"],
    ["apoiador", "Participante"],
    ["militante", "Multiplicador"],
    ["voto_certo", "Multiplicador"], // chave desligada: nunca aparece
  ])("mandato: %s → %s", (value, label) => {
    expect(rotuloDoNivel(value)).toBe(label);
    expect(rotuloDoNivel(value, false)).toBe(label);
  });

  it("campanha: voto_certo → 'Voto declarado'", () => {
    expect(rotuloDoNivel("voto_certo", true)).toBe("Voto declarado");
    expect(rotuloDoNivel("militante", true)).toBe("Multiplicador");
  });

  it("plural segue a mesma regra", () => {
    expect(pluralDoNivel("simpatizante")).toBe("Em conversa");
    expect(pluralDoNivel("voto_certo")).toBe("Multiplicadores");
    expect(pluralDoNivel("voto_certo", true)).toBe("Votos declarados");
  });

  it("nivelParaExibir: voto_certo → militante só com a chave desligada", () => {
    expect(nivelParaExibir("voto_certo", false)).toBe("militante");
    expect(nivelParaExibir("voto_certo", true)).toBe("voto_certo");
    expect(nivelParaExibir("apoiador", false)).toBe("apoiador");
  });

  it("valor desconhecido / vazio não quebra", () => {
    expect(rotuloDoNivel("qualquer")).toBe("qualquer");
    expect(rotuloDoNivel(null)).toBe("");
    expect(rotuloDoNivel(undefined)).toBe("");
    expect(nivelParaExibir(null, false)).toBe("");
  });
});

describe("trilhaDosNiveis / nivelAceitoNaEntrada", () => {
  it("a trilha do mandato tem 4 passos", () => {
    expect(trilhaDosNiveis()).toBe("Novo contato → Em conversa → Participante → Multiplicador");
  });

  it("voto_certo vindo de fora só entra com a chave de campanha", () => {
    expect(nivelAceitoNaEntrada("voto_certo", false)).toBe(false);
    expect(nivelAceitoNaEntrada("voto_certo", true)).toBe(true);
    expect(nivelAceitoNaEntrada("militante", false)).toBe(true);
    expect(nivelAceitoNaEntrada("inventado", true)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { dataDoRelatorio, itensComMarcador, montarRelatorioDeVisita, problemaDoRelatorioDeVisita } from "./relatorio-de-visita";

describe("relatório de visita técnica", () => {
  it("só sai de visita realizada e com relato", () => {
    expect(problemaDoRelatorioDeVisita({ assunto: "x", realizadaEm: null, relato: "algo" })).toContain("realizada");
    expect(problemaDoRelatorioDeVisita({ assunto: "x", realizadaEm: "2026-11-14T15:00:00Z", relato: "  " })).toContain("relato");
    expect(problemaDoRelatorioDeVisita({ assunto: "x", realizadaEm: "2026-11-14T15:00:00Z", relato: "Buraco de 2 m." })).toBeNull();
  });

  it("data no horário de Brasília (23h de Brasília ainda é o mesmo dia)", () => {
    expect(dataDoRelatorio("2026-11-15T02:00:00Z")).toBe("14 de novembro de 2026");
    expect(dataDoRelatorio(null)).toBeNull();
    expect(dataDoRelatorio("lixo")).toBeNull();
  });

  it("data guardada sem hora sai no MESMO dia (era um dia antes)", () => {
    expect(dataDoRelatorio("2026-11-14")).toBe("14 de novembro de 2026");
    expect(dataDoRelatorio("2026-01-01")).toBe("1 de janeiro de 2026");
  });

  it("lista de presentes: um por linha ou separados por ponto e vírgula; vírgula NÃO parte nome de cargo", () => {
    expect(itensComMarcador("Fulano, Secretário de Obras")).toBe("– Fulano, Secretário de Obras.");
    expect(itensComMarcador("João Silva, Secretário de Obras; Maria, SLU")).toBe("– João Silva, Secretário de Obras;\n– Maria, SLU.");
    expect(itensComMarcador("- Fulano\n• Beltrano.\n")).toBe("– Fulano;\n– Beltrano.");
    expect(itensComMarcador("  ")).toBe("");
  });

  it("monta o texto só com o que foi registrado, sem inventar seção vazia", () => {
    const t = montarRelatorioDeVisita({
      assunto: "Erosão na encosta",
      orgao: "Defesa Civil",
      municipio: "Belo Horizonte",
      local: "Rua A, 10, Centro",
      realizadaEm: "2026-11-14T15:00:00Z",
      presentes: "Fulano, Beltrano",
      relato: "Encosta com fissura de 3 metros.",
      decisoes: "Pedir laudo à Defesa Civil.",
      relatoPor: "Ana Lima",
    });
    expect(t).toContain("Assunto: Erosão na encosta.");
    expect(t).toContain("Data da visita: 14 de novembro de 2026.");
    expect(t).toContain("Local: Rua A, 10, Centro, Belo Horizonte.");
    expect(t).toContain("Estiveram presentes:\n– Fulano, Beltrano.");
    expect(t).toContain("O que foi constatado:\nEncosta com fissura de 3 metros.");
    expect(t).toContain("Encaminhamentos:\nPedir laudo à Defesa Civil.");
    expect(t).toContain("Relato registrado por Ana Lima.");

    // campo que já termina em ponto não ganha outro
    expect(montarRelatorioDeVisita({ assunto: "Buraco na via.", realizadaEm: "2026-11-14", relato: "x" })).toContain("Assunto: Buraco na via.\nData da visita: 14 de novembro de 2026.");

    const curto = montarRelatorioDeVisita({ assunto: null, realizadaEm: "2026-11-14T15:00:00Z", relato: "Tudo em ordem." });
    expect(curto).toContain("Assunto: Visita técnica.");
    expect(curto).not.toContain("Estiveram presentes");
    expect(curto).not.toContain("Encaminhamentos");
    expect(curto).not.toContain("Local:");
  });
});

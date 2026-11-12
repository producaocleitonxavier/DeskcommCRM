import { describe, expect, it } from "vitest";

import { linhaDeAvaliacao, mediaPtBR, notaPedeAtencao, notaValida, resumirNotas } from "./avaliacao-texto";
import { textoAvisoCidadao, textoAvisoEncerramento } from "./aviso-cidadao-texto";

describe("nota do cidadão — partes puras", () => {
  it("aceita só inteiro de 1 a 5", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(notaValida(n)).toBe(true);
  });

  it("controle negativo: recusa 0, 6, fração, texto e vazio", () => {
    for (const n of [0, 6, -1, 4.5, "5", null, undefined, NaN, {}]) expect(notaValida(n)).toBe(false);
  });

  it("a linha de avaliação leva o link; sem link não escreve nada", () => {
    expect(linhaDeAvaliacao("https://x.com/avaliar/abc")).toContain("https://x.com/avaliar/abc");
    expect(linhaDeAvaliacao("https://x.com/avaliar/abc")).toContain("Como foi o nosso atendimento?");
    expect(linhaDeAvaliacao(null)).toBe("");
    expect(linhaDeAvaliacao("   ")).toBe("");
  });

  it("nota 1 e 2 pedem atenção; 3 a 5 não", () => {
    expect([1, 2].every(notaPedeAtencao)).toBe(true);
    expect([3, 4, 5, null, undefined].some(notaPedeAtencao)).toBe(false);
  });

  it("resume: total, média com uma casa e quantas baixas, ignorando lixo", () => {
    expect(resumirNotas([5, 4, 2, null, "x", 9])).toEqual({ total: 3, media: 3.7, baixas: 1 });
    expect(resumirNotas([])).toEqual({ total: 0, media: null, baixas: 0 });
  });

  it("média em português usa vírgula", () => {
    expect(mediaPtBR(4.5)).toBe("4,5");
    expect(mediaPtBR(null)).toBe("—");
  });
});

describe("aviso ao cidadão com o link da nota", () => {
  const base = { primeiroNome: "Ana", nomeParlamentar: "Fulano", cargo: "vereador", protocolo: "001/2026" };

  it("resolução e encerramento levam o link no fim", () => {
    const link = "https://x.com/avaliar/abc";
    expect(textoAvisoCidadao({ ...base, ehResolucao: true, comOficio: false, linkAvaliacao: link }).endsWith(link)).toBe(true);
    expect(textoAvisoEncerramento({ ...base, linkAvaliacao: link }).endsWith(link)).toBe(true);
  });

  it("controle negativo: encaminhamento NUNCA leva o link (o atendimento não terminou)", () => {
    const link = "https://x.com/avaliar/abc";
    expect(textoAvisoCidadao({ ...base, ehResolucao: false, comOficio: true, linkAvaliacao: link })).not.toContain("avaliar");
    expect(textoAvisoCidadao({ ...base, ehResolucao: false, comOficio: false, linkAvaliacao: link })).not.toContain("avaliar");
  });

  it("sem link, o texto é o de sempre", () => {
    expect(textoAvisoCidadao({ ...base, ehResolucao: true, comOficio: false })).not.toContain("Como foi o nosso atendimento");
    expect(textoAvisoEncerramento(base)).not.toContain("Como foi o nosso atendimento");
  });
});

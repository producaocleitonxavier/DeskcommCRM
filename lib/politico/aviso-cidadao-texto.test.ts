import { describe, expect, it } from "vitest";

import { textoAvisoCidadao } from "./aviso-cidadao-texto";

describe("textoAvisoCidadao", () => {
  it("resolução: boa notícia com protocolo e nome", () => {
    const t = textoAvisoCidadao({ ehResolucao: true, comOficio: false, primeiroNome: "Maria", protocolo: "OF. 12/2026" });
    expect(t).toMatch(/^Olá, Maria!/);
    expect(t).toContain("foi RESOLVIDA");
    expect(t).toContain("protocolo OF. 12/2026");
  });

  it("encaminhamento COM ofício: texto curto da capa", () => {
    const t = textoAvisoCidadao({ ehResolucao: false, comOficio: true, primeiroNome: "João", nomeParlamentar: "Cleiton Xavier", cargo: "vereador" });
    expect(t).toContain("Segue o ofício");
    expect(t).toContain("do vereador Cleiton Xavier");
  });

  it("encaminhamento SEM ofício: 'já encaminhei, te retorno'", () => {
    const t = textoAvisoCidadao({ ehResolucao: false, comOficio: false, primeiroNome: "Ana" });
    expect(t).toContain("já foi encaminhada ao órgão responsável");
    expect(t).toContain("Aqui é do gabinete."); // sem nome do parlamentar = genérico
  });

  it("sem nome: abre com 'Olá!'", () => {
    expect(textoAvisoCidadao({ ehResolucao: false, comOficio: false })).toMatch(/^Olá! /);
  });

  it("GUARDRAIL: sem promessa de prazo, sem variável vazada", () => {
    const t = textoAvisoCidadao({ ehResolucao: true, comOficio: false, primeiroNome: "Zé", protocolo: "#ABC" });
    expect(t).not.toContain("{{");
    expect(t).not.toMatch(/resolvo até|garanto|prometo/i);
  });

  it("resolução sem protocolo: não escreve 'protocolo ' vazio", () => {
    const t = textoAvisoCidadao({ ehResolucao: true, comOficio: false, primeiroNome: "Lia", protocolo: "" });
    expect(t).not.toContain("protocolo )");
    expect(t).toContain("a sua demanda foi RESOLVIDA");
  });
});

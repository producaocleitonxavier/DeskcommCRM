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

describe("textoAvisoEncerramento — o NÃO também é uma resposta", () => {
  it("diz com clareza que não foi possível, com nome, gabinete e protocolo", async () => {
    const { textoAvisoEncerramento } = await import("./aviso-cidadao-texto");
    const t = textoAvisoEncerramento({ primeiroNome: "Maria", nomeParlamentar: "Fulano", cargo: "vereador", protocolo: "OF 12/2026" });
    expect(t).toContain("Olá, Maria!");
    expect(t).toContain("gabinete do vereador Fulano");
    expect(t).toContain("(protocolo OF 12/2026)");
    expect(t).toContain("não foi possível");
  });
  it("sem nome/gabinete/protocolo cai no genérico, sem buraco no texto", async () => {
    const { textoAvisoEncerramento } = await import("./aviso-cidadao-texto");
    const t = textoAvisoEncerramento({});
    expect(t.startsWith("Olá! Aqui é do gabinete. Sobre a sua demanda: ")).toBe(true);
    expect(t).not.toContain("undefined");
    expect(t).not.toContain("  ");
  });
  it("não promete prazo nem nova tentativa, e não acende o alerta eleitoral", async () => {
    const { textoAvisoEncerramento } = await import("./aviso-cidadao-texto");
    const { detectarPromessaDeCampanha } = await import("@/lib/agent-engine/guardrails/promessa-de-campanha");
    const t = textoAvisoEncerramento({ primeiroNome: "João", nomeParlamentar: "Fulano", cargo: "vereador" });
    expect(t).not.toMatch(/prometo|garanto|vou resolver|em breve|prazo/i);
    expect(detectarPromessaDeCampanha(t).achou).toBe(false);
  });
});

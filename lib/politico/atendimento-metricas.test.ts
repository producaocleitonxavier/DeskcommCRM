import { describe, expect, it } from "vitest";

import { calcularMetricasDeAtendimento, formatarDuracao, horaDeBrasilia, type MensagemParaMetricas } from "./atendimento-metricas";

const m = (conv: string, dir: "inbound" | "outbound", iso: string, user: string | null = null): MensagemParaMetricas => ({
  conversation_id: conv,
  direction: dir,
  created_at: iso,
  sent_by_user_id: user,
});

describe("números de atendimento do Painel", () => {
  it("sem mensagens: tudo zero e a mediana é null (nunca 0)", () => {
    const r = calcularMetricasDeAtendimento([]);
    expect(r.conversas).toBe(0);
    expect(r.taxaDeResposta).toBeNull();
    expect(r.medianaPrimeiraRespostaSeg).toBeNull();
    expect(r.horaDePico).toBeNull();
    expect(r.recebidasPorHora).toHaveLength(24);
  });

  it("conta conversa, resposta, vazamento e quem respondeu primeiro", () => {
    const r = calcularMetricasDeAtendimento([
      // A: IA responde em 30s
      m("A", "inbound", "2026-11-10T15:00:00Z"),
      m("A", "outbound", "2026-11-10T15:00:30Z"),
      // B: pessoa responde em 10 min
      m("B", "inbound", "2026-11-10T16:00:00Z"),
      m("B", "outbound", "2026-11-10T16:10:00Z", "user-1"),
      // C: ninguém respondeu (o vazamento)
      m("C", "inbound", "2026-11-10T17:00:00Z"),
    ]);
    expect(r.conversas).toBe(3);
    expect(r.respondidas).toBe(2);
    expect(r.semResposta).toBe(1);
    expect(r.taxaDeResposta).toBe(67);
    expect(r.primeiraRespostaPelaIA).toBe(1);
    expect(r.primeiraRespostaPorPessoa).toBe(1);
    expect(r.medianaPrimeiraRespostaSeg).toBe(315); // mediana de 30s e 600s
  });

  it("envio nosso ANTES da mensagem da pessoa não conta como resposta", () => {
    const r = calcularMetricasDeAtendimento([
      m("A", "outbound", "2026-11-10T12:00:00Z"),
      m("A", "inbound", "2026-11-10T13:00:00Z"),
    ]);
    expect(r.conversas).toBe(1);
    expect(r.respondidas).toBe(0);
    expect(r.semResposta).toBe(1);
  });

  it("conversa só com envio nosso não é atendimento", () => {
    const r = calcularMetricasDeAtendimento([m("A", "outbound", "2026-11-10T12:00:00Z")]);
    expect(r.conversas).toBe(0);
  });

  it("mediana não é puxada pela resposta que esperou a noite (trava de horário)", () => {
    const r = calcularMetricasDeAtendimento([
      m("A", "inbound", "2026-11-10T15:00:00Z"), m("A", "outbound", "2026-11-10T15:00:20Z"),
      m("B", "inbound", "2026-11-10T15:00:00Z"), m("B", "outbound", "2026-11-10T15:00:40Z"),
      m("C", "inbound", "2026-11-11T02:00:00Z"), m("C", "outbound", "2026-11-11T10:00:00Z"), // 8h
    ]);
    expect(r.medianaPrimeiraRespostaSeg).toBe(40);
  });

  it("hora do dia é a de Brasília, e o pico aponta a hora mais movimentada", () => {
    expect(horaDeBrasilia("2026-11-11T02:15:00Z")).toBe(23); // 23h15 do dia 10 em BRT
    const r = calcularMetricasDeAtendimento([
      m("A", "inbound", "2026-11-11T02:15:00Z"),
      m("A", "inbound", "2026-11-11T02:24:00Z"),
      m("B", "inbound", "2026-11-10T13:00:00Z"),
    ]);
    expect(r.recebidasPorHora[23]).toBe(2);
    expect(r.recebidasPorHora[10]).toBe(1);
    expect(r.horaDePico).toBe(23);
  });

  it("formata duração em linguagem de gente", () => {
    expect(formatarDuracao(null)).toBe("—");
    expect(formatarDuracao(45)).toBe("45 s");
    expect(formatarDuracao(720)).toBe("12 min");
    expect(formatarDuracao(12000)).toBe("3 h 20 min");
    expect(formatarDuracao(172800)).toBe("2 dias");
  });
});

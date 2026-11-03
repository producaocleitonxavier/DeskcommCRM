import { describe, it, expect } from "vitest";

import { visitaPendente, visitaAgendada, visitaSemResponsavel } from "@/lib/politico/visita-tecnica";

const PASSADO = "2020-01-01T12:00:00.000Z"; // bem no passado
const FUTURO = new Date(Date.now() + 7 * 86400000).toISOString(); // daqui a uma semana

describe("visitaPendente — visita marcada e NÃO feita", () => {
  it("marcada no passado, não realizada, aberta → pendente", () => {
    expect(visitaPendente({ visitaEm: PASSADO, realizadaEm: null, estado: "em_atendimento" })).toBe(true);
  });
  it("ANTI-TAUTOLOGIA: visita FUTURA não é pendente (depende do dia ter passado)", () => {
    expect(visitaPendente({ visitaEm: FUTURO, realizadaEm: null, estado: "em_atendimento" })).toBe(false);
  });
  it("CONTROLE NEGATIVO: realizada não é pendente, mesmo com dia passado", () => {
    expect(visitaPendente({ visitaEm: PASSADO, realizadaEm: "2020-01-02", estado: "em_atendimento" })).toBe(false);
  });
  it("demanda resolvida/encerrada não cobra visita", () => {
    expect(visitaPendente({ visitaEm: PASSADO, realizadaEm: null, estado: "resolvida" })).toBe(false);
    expect(visitaPendente({ visitaEm: PASSADO, realizadaEm: null, estado: "encerrada" })).toBe(false);
  });
  it("sem data de visita → nunca pendente; data inválida → não quebra", () => {
    expect(visitaPendente({ visitaEm: null, realizadaEm: null, estado: "aberta" })).toBe(false);
    expect(visitaPendente({ visitaEm: "não-é-data", realizadaEm: null, estado: "aberta" })).toBe(false);
  });
});

describe("visitaSemResponsavel — pendente E ninguém marcou", () => {
  it("pendente, sem responsável → true", () => {
    expect(visitaSemResponsavel({ visitaEm: PASSADO, realizadaEm: null, estado: "em_atendimento", responsavelId: null })).toBe(true);
    expect(visitaSemResponsavel({ visitaEm: PASSADO, realizadaEm: null, estado: "em_atendimento", responsavelId: "  " })).toBe(true);
  });
  it("ANTI-TAUTOLOGIA: pendente COM responsável → NÃO acusa 'sem responsável'", () => {
    expect(visitaSemResponsavel({ visitaEm: PASSADO, realizadaEm: null, estado: "em_atendimento", responsavelId: "user-123" })).toBe(false);
  });
  it("visita FUTURA sem responsável não é 'sem responsável' (nem é pendente)", () => {
    expect(visitaSemResponsavel({ visitaEm: FUTURO, realizadaEm: null, estado: "em_atendimento", responsavelId: null })).toBe(false);
  });
  it("realizada não acusa, mesmo sem responsável", () => {
    expect(visitaSemResponsavel({ visitaEm: PASSADO, realizadaEm: "2020-01-02", estado: "em_atendimento", responsavelId: null })).toBe(false);
  });
});

describe("visitaAgendada — visita futura ainda por fazer", () => {
  it("marcada no futuro, não realizada, aberta → agendada", () => {
    expect(visitaAgendada({ visitaEm: FUTURO, realizadaEm: null, estado: "em_atendimento" })).toBe(true);
  });
  it("marcada no passado NÃO é 'agendada' (é pendente) — não se sobrepõem", () => {
    expect(visitaAgendada({ visitaEm: PASSADO, realizadaEm: null, estado: "em_atendimento" })).toBe(false);
  });
});

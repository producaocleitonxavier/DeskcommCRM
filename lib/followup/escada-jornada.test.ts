import { describe, expect, it } from "vitest";

import { jornadaDaEscada, simularEscada } from "./escada-jornada";
import type { EscadaSpec } from "./modelos/escada";

const DIA = 86_400_000;

// Escada de 2 toques: manda no ato, espera 3 dias, manda de novo.
const SPEC: EscadaSpec = {
  toques: [
    { texto: "Oi! Tudo bem? Passando pra saber se podemos ajudar.", rotulo: "Boas-vindas" },
    { esperaAntesMs: 3 * DIA, texto: "Continuamos à disposição por aqui.", rotulo: "Lembrete" },
  ],
  prazoDeRespostaMs: 2 * DIA,
  sim: { rotulo: "quero ajuda", padrao: "quero|sim|ajuda" },
  notaDeResposta: "a conversa volta para o assessor",
};

describe("jornadaDaEscada — o mapa completo", () => {
  const j = jornadaDaEscada(SPEC);

  it("tem um momento por toque", () => {
    expect(j.momentos).toHaveLength(2);
    expect(j.totalToques).toBe(2);
  });

  it("o 1º toque sai no ato; o 2º após 3 dias (+ 2 dias do prazo do 1º)", () => {
    expect(j.momentos[0]!.msDesdeInicio).toBe(0);
    expect(j.momentos[0]!.quando).toBe("assim que dispara");
    // 2 dias (prazo do toque 1) + 3 dias (espera antes do toque 2) = 5 dias.
    expect(j.momentos[1]!.msDesdeInicio).toBe(5 * DIA);
    expect(j.momentos[1]!.quando).toContain("5 dias");
  });

  it("todo toque mostra os três desfechos; o último encerra sem seguir", () => {
    expect(j.momentos[0]!.seNaoResponder).toContain("próxima mensagem");
    expect(j.momentos[1]!.seNaoResponder).toContain("sem resposta");
    expect(j.momentos[0]!.seResponderSim).toContain("GANHO");
    expect(j.momentos[0]!.seResponderOutro).toContain("assessor");
  });

  it("o horizonte é o pior caso (nunca respondeu): 7 dias", () => {
    // toque1 (0) + prazo 2d + espera 3d + prazo 2d = 7 dias.
    expect(j.horizonteMs).toBe(7 * DIA);
    expect(j.horizonteTexto).toContain("7 dias");
  });
});

describe("simularEscada — traça um cenário", () => {
  it("ignora tudo → encerra sem resposta, recebeu as 2 mensagens", () => {
    const r = simularEscada(SPEC, ["ignora", "ignora"]);
    expect(r.desfecho).toContain("sem resposta");
    expect(r.mensagensRecebidas).toBe(2);
  });

  it("responde sim no 1º → GANHO, recebeu só 1 mensagem", () => {
    const r = simularEscada(SPEC, ["responde_sim"]);
    expect(r.desfecho).toContain("GANHO");
    expect(r.mensagensRecebidas).toBe(1);
    expect(r.passos.at(-1)!.acao).toContain("quero ajuda");
  });

  it("ignora o 1º, responde outra coisa no 2º → volta ao atendimento, 2 mensagens", () => {
    const r = simularEscada(SPEC, ["ignora", "responde_outro"]);
    expect(r.desfecho).toContain("assessor");
    expect(r.mensagensRecebidas).toBe(2);
  });

  it("roteiro curto assume IGNORA no resto (pior caso)", () => {
    const r = simularEscada(SPEC, []);
    expect(r.desfecho).toContain("sem resposta");
    expect(r.mensagensRecebidas).toBe(2);
  });
});

/**
 * A régua de saúde traduz a decisão do MOTOR, e a ORDEM dos ramos é o que ela
 * mais fácil erra. O caso que prende a ordem: um número novo (nunca liberado) com
 * hold de block_rate NÃO pode virar "em espera" — ele está "aguardando liberação",
 * porque nunca passou do go-live. Trocar a ordem dos ifs deixaria isso errado sem
 * quebrar mais nada; por isso o controle explícito.
 */
import { describe, expect, it } from "vitest";

import { classificar, type LinhaDeSaude } from "./saude-dos-numeros";

const linha = (p: Partial<LinhaDeSaude>): LinhaDeSaude => ({
  health_hold_active: false,
  health_hold_reason: null,
  health_released_at: "2026-11-01T00:00:00.000Z",
  ...p,
});

describe("classificar saúde do número", () => {
  it("sem linha de saúde → sem_dados", () => {
    expect(classificar(undefined)).toBe("sem_dados");
    expect(classificar(null)).toBe("sem_dados");
  });

  it("nunca liberado (released_at null), sem hold ainda → aguardando_liberacao", () => {
    // O frame do número recém-criado ANTES do primeiro tick do circuito: hold
    // inativo, mas não liberado. Pintar de "saudável" seria mentira.
    expect(classificar(linha({ health_released_at: null }))).toBe("aguardando_liberacao");
  });

  it("hold ativo com motivo go_live → aguardando_liberacao", () => {
    expect(
      classificar(linha({ health_released_at: null, health_hold_active: true, health_hold_reason: "go_live" })),
    ).toBe("aguardando_liberacao");
  });

  it("liberado e em hold por block_rate → em_espera", () => {
    expect(
      classificar(linha({ health_hold_active: true, health_hold_reason: "block_rate" })),
    ).toBe("em_espera");
  });

  it("liberado e em hold por response_rate → em_espera", () => {
    expect(
      classificar(linha({ health_hold_active: true, health_hold_reason: "response_rate" })),
    ).toBe("em_espera");
  });

  it("liberado e sem hold → saudavel", () => {
    expect(classificar(linha({}))).toBe("saudavel");
  });

  it("CONTROLE: nunca liberado VENCE o hold de block_rate (ordem dos ramos)", () => {
    // Se alguém trocar a ordem (hold antes de released), este caso fica vermelho:
    // um número novo que ainda não foi ao go-live não pode ser rotulado "em espera".
    const novoComBloqueio = linha({
      health_released_at: null,
      health_hold_active: true,
      health_hold_reason: "block_rate",
    });
    expect(classificar(novoComBloqueio)).toBe("aguardando_liberacao");
  });
});

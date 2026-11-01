import { describe, it, expect } from "vitest";

import { scriptRecado, AVISO_IA_FALADO } from "./recado";

describe("scriptRecado — aniversário", () => {
  it("personaliza com o nome da pessoa e o do político, e inclui o aviso de IA", () => {
    const t = scriptRecado({ momento: "aniversario", primeiroNome: "Maria", nomeParlamentar: "Cleiton Xavier" });
    expect(t).toContain("Feliz aniversário, Maria!");
    expect(t).toContain("Aqui é Cleiton Xavier.");
    expect(t).toContain("saúde, paz e prosperidade");
    expect(t).toContain("Conte sempre comigo");
    expect(t.trim().endsWith(AVISO_IA_FALADO)).toBe(true);
  });

  it("sem nome da pessoa: saudação genérica, sem vírgula pendurada", () => {
    const t = scriptRecado({ momento: "aniversario", primeiroNome: null, nomeParlamentar: "Cleiton Xavier" });
    expect(t).toContain("Feliz aniversário!");
    expect(t).not.toContain("Feliz aniversário,");
    expect(t).toContain("Aqui é Cleiton Xavier.");
  });

  it("sem nome do político: não se apresenta (jamais inventa nome)", () => {
    const t = scriptRecado({ momento: "aniversario", primeiroNome: "João", nomeParlamentar: null });
    expect(t).toContain("Feliz aniversário, João!");
    expect(t).not.toContain("Aqui é");
  });

  it("incluirAvisoIA=false (rótulo falado no áudio, modo campanha): sem o aviso no fim do roteiro", () => {
    const t = scriptRecado({ momento: "aniversario", primeiroNome: "Ana", nomeParlamentar: "X", incluirAvisoIA: false });
    expect(t).not.toContain(AVISO_IA_FALADO);
    expect(t).toContain("Feliz aniversário, Ana!");
  });

  it("não quebra os momentos existentes (resolucao/encaminhamento seguem com 'Olá')", () => {
    const res = scriptRecado({ momento: "resolucao", primeiroNome: "Zé", nomeParlamentar: "Y" });
    expect(res).toContain("Olá, Zé!");
    expect(res).toContain("foi resolvido");
    const enc = scriptRecado({ momento: "encaminhamento", primeiroNome: "Zé", nomeParlamentar: "Y" });
    expect(enc).toContain("encaminhado");
  });
});

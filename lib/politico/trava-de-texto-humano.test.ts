import { describe, expect, it } from "vitest";
import { bloqueioDeTextoHumano } from "./trava-de-texto-humano";

describe("trava do texto escrito por pessoa", () => {
  it("bloqueia troca por voto, retribuição e ameaça", () => {
    for (const t of ["Vota no 15 que eu te arranjo um emprego", "Resolvemos, lembra da gente na eleição", "Quem não apoiar fica sem a cesta básica"]) {
      expect(bloqueioDeTextoHumano(t), t).toContain("art. 41-A");
    }
  });
  it("promessa e garantia NÃO bloqueiam (seguem como advertência)", () => {
    expect(bloqueioDeTextoHumano("Vou conseguir sua vaga na creche")).toBeNull();
    expect(bloqueioDeTextoHumano("Prometo que vou resolver")).toBeNull();
  });
  it("texto acima do teto não segue (o detector não leria o fim)", () => {
    expect(bloqueioDeTextoHumano("a".repeat(4001))).toContain("longo demais");
  });
  it("rotina e vazio passam", () => {
    expect(bloqueioDeTextoHumano("Sua demanda foi encaminhada à Secretaria de Obras.")).toBeNull();
    expect(bloqueioDeTextoHumano("")).toBeNull();
    expect(bloqueioDeTextoHumano(null)).toBeNull();
  });
});

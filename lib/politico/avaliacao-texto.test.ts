import { describe, expect, it } from "vitest";

import { agradecimentoDaNota, lerNotaDaResposta, mediaPtBR, notaPedeAtencao, notaValida, perguntaDeAvaliacao, resumirNotas } from "./avaliacao-texto";
import { textoAvisoCidadao, textoAvisoEncerramento } from "./aviso-cidadao-texto";

describe("nota do cidadão — partes puras", () => {
  it("aceita só inteiro de 1 a 5", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(notaValida(n)).toBe(true);
  });

  it("controle negativo: recusa 0, 6, fração, texto e vazio", () => {
    for (const n of [0, 6, -1, 4.5, "5", null, undefined, NaN, {}]) expect(notaValida(n)).toBe(false);
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

describe("a pergunta vai SEM LINK e a pessoa responde com o número", () => {
  it("a pergunta lista as cinco notas e não tem link nenhum", () => {
    const p = perguntaDeAvaliacao();
    expect(p).toContain("de 1 a 5");
    for (const linha of ["1 - Muito ruim", "2 - Ruim", "3 - Regular", "4 - Bom", "5 - Muito bom"]) expect(p).toContain(linha);
    expect(p).toContain("responder com o número");
    expect(p).not.toMatch(/https?:|www\.|\/avaliar/);
  });

  it("lê a nota quando a mensagem É a nota", () => {
    expect(lerNotaDaResposta("5")).toBe(5);
    expect(lerNotaDaResposta(" 4 ")).toBe(4);
    expect(lerNotaDaResposta("3.")).toBe(3);
    expect(lerNotaDaResposta("5!")).toBe(5);
    expect(lerNotaDaResposta("Nota 2")).toBe(2);
    expect(lerNotaDaResposta("nota: 1")).toBe(1);
    expect(lerNotaDaResposta("5️⃣")).toBe(5);
    expect(lerNotaDaResposta("Cinco")).toBe(5);
    expect(lerNotaDaResposta("três")).toBe(3);
  });

  it("controle negativo: número no meio de frase, fora da faixa ou conversa comum NÃO é nota", () => {
    for (const t of ["5 pessoas vieram aqui", "15", "0", "6", "55", "1 2", "rua 5", "obrigado", "sim", "", "   ", null, undefined, "nota", "5 estrelas pra vocês"]) {
      expect(lerNotaDaResposta(t)).toBeNull();
    }
  });

  it("agradece; na nota baixa convida a contar o que faltou, sem prometer nada", () => {
    expect(agradecimentoDaNota(5)).toContain("Obrigado pela sua avaliação");
    expect(agradecimentoDaNota(1)).toContain("contar o que faltou");
    expect(agradecimentoDaNota(2)).not.toMatch(/vamos resolver|prometo|garant/i);
  });
});

describe("o aviso ao cidadão não leva link de avaliação", () => {
  const base = { primeiroNome: "Ana", nomeParlamentar: "Fulano", cargo: "vereador", protocolo: "001/2026" };
  it("resolução, encaminhamento e encerramento seguem sem link", () => {
    for (const t of [
      textoAvisoCidadao({ ...base, ehResolucao: true, comOficio: false }),
      textoAvisoCidadao({ ...base, ehResolucao: false, comOficio: true }),
      textoAvisoEncerramento(base),
    ]) expect(t).not.toMatch(/https?:|\/avaliar/);
  });
});

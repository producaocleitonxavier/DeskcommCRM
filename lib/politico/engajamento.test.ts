import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeDb } from "@/tests/fake/fake-supabase";
import { recomputarEngajamento } from "./engajamento";

/**
 * ARSENAL — o MOTOR do funil (`recomputarEngajamento`). Prova, exaustivo:
 * TETO do material passivo (receber sozinho NUNCA gradua), reciprocidade
 * (responder > receber), QR/consentimento/indicação (indicar = ouro, 3 = militante),
 * vídeo (soft, teto), thresholds de estágio, FORWARD-ONLY (nunca rebaixa),
 * engajouAgora (piso simpatizante/morno), temperatura por recência, cenários
 * combinados com total exato, e fail-soft.
 */

vi.mock("@/lib/politico/drip-engajamento", () => ({ inscreverGraduadoNoDrip: vi.fn(async () => undefined) }));

const ORG = "org-1";
const CONTATO = "contact-1";

interface Cenario {
  current?: string;
  currentTemp?: string;
  consent?: boolean;
  matCamp?: number;
  matQr?: number;
  respDisparo?: number;
  qrConfirmado?: number;
  indicados?: number;
  shares?: string[];
  aberturas?: number;
  lastActivity?: string | null;
  engajouAgora?: boolean;
  lead?: null;
  throwContacts?: boolean;
}

function fakeAdmin(s: Cenario) {
  const lead =
    s.lead === null
      ? null
      : {
          id: "lead-1",
          support_level: s.current ?? "novo_cadastro",
          temperature: s.currentTemp ?? "frio",
          consent_at: s.consent ? "2026-01-01T00:00:00Z" : null,
        };
  return makeDb({
    pol_leads: (ops) => {
      const up = ops.some((o) => o.m === "update");
      const sel = ops.some((o) => o.m === "select");
      if (up && sel) return { data: { id: "lead-1" }, error: null }; // avanço confirmado
      if (up) return { error: null }; // update final (score+temp)
      return { data: lead, error: null }; // leitura inicial
    },
    campaign_recipients: (ops) => {
      const col = ops.find((o) => o.m === "not")?.args[0];
      return { count: col === "replied_at" ? (s.respDisparo ?? 0) : (s.matCamp ?? 0) };
    },
    pol_qr_cadastros: (ops) => {
      const col = ops.find((o) => o.m === "not")?.args[0];
      return { count: col === "nome_informado" ? (s.qrConfirmado ?? 0) : (s.matQr ?? 0) };
    },
    pol_indicacoes: () => ({ count: s.indicados ?? 0 }),
    contacts: () => {
      if (s.throwContacts) throw new Error("db down");
      return { data: { last_activity_at: s.lastActivity ?? null } };
    },
    pol_video_shares: () => ({ data: (s.shares ?? []).map((id) => ({ id })) }),
    pol_video_cliques: () => ({ count: s.aberturas ?? 0 }),
    pol_funnel_transitions: () => ({ error: null }),
  });
}

async function rodar(s: Cenario) {
  const db = fakeAdmin(s);
  const res = await recomputarEngajamento(db as never, ORG, CONTATO, {
    reason: "teste",
    engajouAgora: s.engajouAgora,
  });
  const finalUpd = db.__calls
    .filter((c) => c.table === "pol_leads" && c.ops?.some((o) => o.m === "update") && !c.ops?.some((o) => o.m === "select"))
    .pop();
  const escrito = finalUpd?.ops?.find((o) => o.m === "update")?.args[0] as
    | { political_score?: number; temperature?: string }
    | undefined;
  return { res, escrito, db };
}

beforeEach(() => vi.clearAllMocks());

describe("TETO do material passivo (receber sozinho NUNCA gradua)", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 4],
    [6, 4],
    [8, 4],
    [12, 4],
    [50, 4],
  ])("matCamp=%i → score=%i e continua novo_cadastro", async (mat, score) => {
    const { res } = await rodar({ matCamp: mat });
    expect(res.score).toBe(score);
    expect(res.estagio).toBe("novo_cadastro");
    expect(res.avancou).toBe(false);
  });

  it("material de campanha + QR somam no mesmo teto 4", async () => {
    const { res } = await rodar({ matCamp: 3, matQr: 3 });
    expect(res.score).toBe(4); // min(6,4)
    expect(res.estagio).toBe("novo_cadastro");
  });
});

describe("Responder (recíproco, +5, teto 5 respostas)", () => {
  it.each([
    [0, 0, "novo_cadastro", false],
    [1, 5, "simpatizante", true],
    [2, 10, "simpatizante", true],
    [3, 15, "simpatizante", true],
    [4, 20, "apoiador", true],
    [5, 25, "apoiador", true],
    [6, 25, "apoiador", true],
    [10, 25, "apoiador", true],
    [50, 25, "apoiador", true],
  ])("respDisparo=%i → score=%i, estágio=%s", async (resp, score, estagio, avancou) => {
    const { res } = await rodar({ respDisparo: resp });
    expect(res.score).toBe(score);
    expect(res.estagio).toBe(estagio);
    expect(res.avancou).toBe(avancou);
  });
});

describe("QR (+6) e Consentimento (+10)", () => {
  it.each([
    [0, 0],
    [1, 6],
    [3, 6],
    [99, 6],
  ])("qrConfirmado=%i → score=%i", async (qr, score) => {
    const { res } = await rodar({ qrConfirmado: qr });
    expect(res.score).toBe(score);
  });
  it("consentiu → +10 (simpatizante)", async () => {
    const { res } = await rodar({ consent: true });
    expect(res.score).toBe(10);
    expect(res.estagio).toBe("simpatizante");
  });
  it("sem consentimento → 0", async () => {
    const { res } = await rodar({ consent: false });
    expect(res.score).toBe(0);
  });
});

describe("Indicação (+10/pessoa; 3 = Multiplicador na hora)", () => {
  it.each([
    [0, 0, "novo_cadastro"],
    [1, 10, "simpatizante"],
    [2, 20, "apoiador"],
    [3, 30, "militante"], // bump: score daria apoiador, mas 3 indicados = militante
    [4, 40, "militante"],
    [5, 50, "militante"],
    [8, 80, "militante"],
  ])("indicados=%i → score=%i, estágio=%s", async (ind, score, estagio) => {
    const { res } = await rodar({ indicados: ind });
    expect(res.score).toBe(score);
    expect(res.estagio).toBe(estagio);
  });
});

describe("Vídeo (soft: +0,5/abertura, teto 10 aberturas = +5)", () => {
  it.each([
    [0, 0, "novo_cadastro"],
    [1, 1, "novo_cadastro"],
    [2, 1, "novo_cadastro"],
    [3, 2, "novo_cadastro"],
    [4, 2, "novo_cadastro"],
    [5, 3, "novo_cadastro"],
    [6, 3, "novo_cadastro"],
    [7, 4, "novo_cadastro"],
    [8, 4, "novo_cadastro"],
    [9, 5, "simpatizante"],
    [10, 5, "simpatizante"],
    [11, 5, "simpatizante"],
    [12, 5, "simpatizante"],
  ])("aberturas=%i → score=%i, estágio=%s", async (ab, score, estagio) => {
    const { res } = await rodar({ shares: ["s1"], aberturas: ab });
    expect(res.score).toBe(score);
    expect(res.estagio).toBe(estagio);
  });

  it("sem shares, o clique não conta (score 0 mesmo com aberturas)", async () => {
    const { res } = await rodar({ shares: [], aberturas: 10 });
    expect(res.score).toBe(0);
  });
});

describe("Thresholds de estágio (score exato construído por sinais)", () => {
  it.each([
    [{}, 0, "novo_cadastro"],
    [{ matCamp: 4 }, 4, "novo_cadastro"],
    [{ respDisparo: 1 }, 5, "simpatizante"],
    [{ consent: true, matCamp: 4, respDisparo: 1 }, 19, "simpatizante"],
    [{ consent: true, respDisparo: 2 }, 20, "apoiador"],
    [{ consent: true, respDisparo: 5, qrConfirmado: 1, matCamp: 4, shares: ["s1"], aberturas: 8 }, 49, "apoiador"],
    [{ consent: true, respDisparo: 5, qrConfirmado: 1, matCamp: 4, shares: ["s1"], aberturas: 10 }, 50, "militante"],
  ] as [Cenario, number, string][])("%o → score=%i, estágio=%s", async (s, score, estagio) => {
    const { res, escrito } = await rodar(s);
    expect(res.score).toBe(score);
    expect(res.estagio).toBe(estagio);
    expect(escrito?.political_score).toBe(score); // o mesmo score é GRAVADO
  });
});

describe("FORWARD-ONLY (nunca rebaixa)", () => {
  it.each([
    ["militante", 0, "novo_cadastro"],
    ["apoiador", 5, "simpatizante"],
    ["voto_certo", 20, "apoiador"],
    ["apoiador", 0, "novo_cadastro"],
  ])("estágio atual %s com score %i (alvo %s) → NÃO rebaixa", async (atual, _score, _alvo) => {
    const s: Cenario =
      _score === 0
        ? { current: atual }
        : _score === 5
          ? { current: atual, respDisparo: 1 }
          : { current: atual, consent: true, respDisparo: 2 };
    const { res } = await rodar(s);
    expect(res.estagio).toBe(atual); // mantém o atual
    expect(res.avancou).toBe(false);
  });

  it("mas AVANÇA quando o alvo é maior que o atual", async () => {
    const { res } = await rodar({ current: "simpatizante", consent: true, respDisparo: 2 }); // 20 → apoiador
    expect(res.estagio).toBe("apoiador");
    expect(res.avancou).toBe(true);
  });
});

describe("engajouAgora (piso simpatizante + morno mesmo com score < 5)", () => {
  it("score 0 + engajouAgora → simpatizante e morno", async () => {
    const { res, escrito } = await rodar({ engajouAgora: true });
    expect(res.estagio).toBe("simpatizante");
    expect(res.avancou).toBe(true);
    expect(res.score).toBe(0);
    expect(escrito?.temperature).toBe("morno");
  });
  it("engajouAgora não rebaixa quem já é apoiador", async () => {
    const { res } = await rodar({ current: "apoiador", consent: true, respDisparo: 2, engajouAgora: true });
    expect(res.estagio).toBe("apoiador");
  });
});

describe("Temperatura por recência (gravada no update final)", () => {
  it.each([
    [{}, "frio"], // score 0, dias null → frio
    [{ consent: true }, "morno"], // score 10, dias null → morno
    [{ consent: true, respDisparo: 2, lastActivity: diasAtras(10) }, "quente"], // 20 + recente
    [{ consent: true, respDisparo: 2, lastActivity: diasAtras(30) }, "morno"], // 20 + ≤60d
    [{ consent: true, respDisparo: 2, lastActivity: diasAtras(90) }, "frio"], // 20 + antigo
    [{ consent: true, respDisparo: 2, lastActivity: diasAtras(10), currentTemp: "quente" }, "quente"],
  ] as [Cenario, string][])("%o → temperatura %s", async (s, temp) => {
    const { escrito } = await rodar(s);
    expect(escrito?.temperature).toBe(temp);
  });

  it("temperatura só AQUECE: atual morno + alvo frio → fica morno (esfriamento é do job diário)", async () => {
    const { escrito } = await rodar({ currentTemp: "morno" }); // score 0 → alvo frio
    expect(escrito?.temperature).toBe("morno");
  });
});

describe("Cenários combinados (total exato)", () => {
  it.each([
    [{ matCamp: 10, respDisparo: 2, consent: true }, 24, "apoiador"], // 4(cap)+10+10
    [{ consent: true, respDisparo: 5, qrConfirmado: 1, matCamp: 4 }, 45, "apoiador"], // 10+25+6+4
    [{ indicados: 1, qrConfirmado: 1 }, 16, "simpatizante"], // 10+6
    [{ indicados: 2, matCamp: 4 }, 24, "apoiador"], // 20+4, <3 indicados → sem bump
    [{ indicados: 3, matCamp: 4 }, 34, "militante"], // 30+4, bump
    [{ consent: true, respDisparo: 5, qrConfirmado: 1, matCamp: 4, shares: ["s1"], aberturas: 10 }, 50, "militante"],
  ] as [Cenario, number, string][])("%o → score=%i, estágio=%s", async (s, score, estagio) => {
    const { res } = await rodar(s);
    expect(res.score).toBe(score);
    expect(res.estagio).toBe(estagio);
  });
});

describe("Fail-soft (nunca derruba a conversa)", () => {
  it("lead inexistente → NADA (temLead:false), sem gravar", async () => {
    const { res, escrito } = await rodar({ lead: null });
    expect(res).toEqual({ temLead: false, score: 0, estagio: "novo_cadastro", avancou: false });
    expect(escrito).toBeUndefined();
  });
  it("erro de banco no meio → NADA (catch), não lança", async () => {
    const { res } = await rodar({ throwContacts: true, consent: true });
    expect(res.temLead).toBe(false);
  });
});

/** ISO de N dias atrás (para a recência). */
function diasAtras(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe("Temperatura — GRADE score × recência (expected hardcoded)", () => {
  const SCORES: { nome: string; s: Cenario; base: number }[] = [
    { nome: "0", s: {}, base: 0 },
    { nome: "10", s: { consent: true }, base: 10 },
    { nome: "20", s: { consent: true, respDisparo: 2 }, base: 20 },
    { nome: "25", s: { respDisparo: 5 }, base: 25 },
  ];
  const DIAS: (number | null)[] = [null, 0, 10, 15, 16, 30, 60, 61, 90];
  // linhas = SCORES, colunas = DIAS
  // Coluna 0 = SEM last_activity_at. O motor converte isso em dias=0 quando
  // score>0 ("tem score = engajou agora"), e em null quando score=0. Por isso
  // score≥20 sem atividade cai em QUENTE (dias 0), não morno.
  const TEMP: string[][] = [
    ["frio", "morno", "morno", "morno", "morno", "morno", "morno", "frio", "frio"], // 0  (null→frio)
    ["morno", "morno", "morno", "morno", "morno", "morno", "morno", "frio", "frio"], // 10 (null→dias0→morno)
    ["quente", "quente", "quente", "quente", "morno", "morno", "morno", "frio", "frio"], // 20 (null→dias0→quente)
    ["quente", "quente", "quente", "quente", "morno", "morno", "morno", "frio", "frio"], // 25
  ];
  const casos: [string, number, number | null, string][] = [];
  SCORES.forEach((sc, i) => DIAS.forEach((d, j) => casos.push([sc.nome, i, d, TEMP[i]![j]!])));

  it.each(casos)("score %s (linha %i), dias=%s → %s", async (_nome, i, dias, temp) => {
    const sc = SCORES[i]!;
    const s: Cenario = { ...sc.s, lastActivity: dias === null ? null : diasAtras(dias as number) };
    const { res, escrito } = await rodar(s);
    expect(res.score).toBe(sc.base);
    expect(escrito?.temperature).toBe(temp);
  });
});

describe("FORWARD-ONLY — matriz estágio_atual × estágio_alvo (5×4)", () => {
  const ALVO: Record<string, Cenario> = {
    novo_cadastro: {},
    simpatizante: { respDisparo: 1 },
    apoiador: { consent: true, respDisparo: 2 },
    militante: { indicados: 5 },
  };
  // [atual, alvo, estágio_resultante, avancou]
  const M: [string, string, string, boolean][] = [
    ["novo_cadastro", "novo_cadastro", "novo_cadastro", false],
    ["novo_cadastro", "simpatizante", "simpatizante", true],
    ["novo_cadastro", "apoiador", "apoiador", true],
    ["novo_cadastro", "militante", "militante", true],
    ["simpatizante", "novo_cadastro", "simpatizante", false],
    ["simpatizante", "simpatizante", "simpatizante", false],
    ["simpatizante", "apoiador", "apoiador", true],
    ["simpatizante", "militante", "militante", true],
    ["apoiador", "novo_cadastro", "apoiador", false],
    ["apoiador", "simpatizante", "apoiador", false],
    ["apoiador", "apoiador", "apoiador", false],
    ["apoiador", "militante", "militante", true],
    ["militante", "novo_cadastro", "militante", false],
    ["militante", "simpatizante", "militante", false],
    ["militante", "apoiador", "militante", false],
    ["militante", "militante", "militante", false],
    ["voto_certo", "novo_cadastro", "voto_certo", false],
    ["voto_certo", "simpatizante", "voto_certo", false],
    ["voto_certo", "apoiador", "voto_certo", false],
    ["voto_certo", "militante", "voto_certo", false],
  ];
  it.each(M)("atual %s + alvo %s → %s (avancou=%s)", async (atual, alvo, resultado, avancou) => {
    const { res } = await rodar({ current: atual, ...ALVO[alvo] });
    expect(res.estagio).toBe(resultado);
    expect(res.avancou).toBe(avancou);
  });
});

describe("Cenários combinados — mais totais exatos", () => {
  it.each([
    [{ respDisparo: 3, qrConfirmado: 1 }, 21, "apoiador"], // 15+6
    [{ matCamp: 2 }, 2, "novo_cadastro"],
    [{ matCamp: 4, respDisparo: 1 }, 9, "simpatizante"], // 4+5
    [{ consent: true, qrConfirmado: 1 }, 16, "simpatizante"], // 10+6
    [{ consent: true, qrConfirmado: 1, respDisparo: 1 }, 21, "apoiador"], // 10+6+5
    [{ indicados: 1, respDisparo: 3 }, 25, "apoiador"], // 10+15
    [{ indicados: 2, respDisparo: 1 }, 25, "apoiador"], // 20+5 (<3 indicados → sem bump)
    [{ matCamp: 4, matQr: 4, consent: true, respDisparo: 5 }, 39, "apoiador"], // 4(cap)+10+25
    [{ shares: ["s1"], aberturas: 6, consent: true, respDisparo: 2 }, 23, "apoiador"], // 3+10+10
    [{ indicados: 4 }, 40, "militante"],
  ] as [Cenario, number, string][])("%o → score=%i, estágio=%s", async (s, score, estagio) => {
    const { res, escrito } = await rodar(s);
    expect(res.score).toBe(score);
    expect(res.estagio).toBe(estagio);
    expect(escrito?.political_score).toBe(score);
  });
});

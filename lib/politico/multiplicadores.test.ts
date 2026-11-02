import { describe, expect, it } from "vitest";

import { makeDb } from "@/tests/fake/fake-supabase";
import { listarMultiplicadores, sugestoesDeMultiplicador } from "./multiplicadores";

/**
 * ARSENAL — placar de MULTIPLICADORES (leitura). Garante: cohort pela tag (com
 * os ZEROS), `trouxe` = contagem de indicações, `alcancou` = rpc, `compartilhou`
 * = alcancou>0, ordenação (trouxe↓ · alcancou↓ · nome pt-BR↑) e as sugestões
 * (exclui cohort, une sinais, rank, teto 10).
 */

const ORG = "org-1";

type Cohort = { id: string; name: string | null; last_activity_at?: string | null };
function indsDe(mapa: Record<string, number>): { indicador_contact_id: string }[] {
  const linhas: { indicador_contact_id: string }[] = [];
  for (const [id, n] of Object.entries(mapa)) for (let i = 0; i < n; i++) linhas.push({ indicador_contact_id: id });
  return linhas;
}
function alcDe(mapa: Record<string, number>): { contact_id: string; alcancou: number }[] {
  return Object.entries(mapa).map(([contact_id, alcancou]) => ({ contact_id, alcancou }));
}
function dbListar(cohort: Cohort[], inds: Record<string, number>, alc: Record<string, number>, sharers: string[] = []) {
  return makeDb({
    contacts: () => ({ data: cohort }),
    pol_indicacoes: () => ({ data: indsDe(inds) }),
    __rpc: () => ({ data: alcDe(alc) }),
    pol_video_shares: () => ({ data: sharers.map((id) => ({ sharer_contact_id: id })) }),
  }) as never;
}
function dbSugestoes(inds: Record<string, number>, alc: Record<string, number>, nomes: Record<string, string | null>) {
  return makeDb({
    pol_indicacoes: () => ({ data: indsDe(inds) }),
    __rpc: () => ({ data: alcDe(alc) }),
    contacts: (ops) => {
      const inOp = ops.find((o) => o.m === "in");
      const ids = (inOp?.args[1] as string[]) ?? [];
      return { data: ids.map((id) => ({ id, name: nomes[id] ?? null })) };
    },
  }) as never;
}

// LCG determinístico — gera cohorts aleatórios reprodutíveis p/ o invariante de ordem.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

describe("listarMultiplicadores — cohort e zeros", () => {
  it("cohort vazio → []", async () => {
    expect(await listarMultiplicadores(dbListar([], {}, {}), ORG)).toEqual([]);
  });

  it("tag mas sem sinal → aparece com ZEROS e compartilhou=false (a 'certeza')", async () => {
    const r = await listarMultiplicadores(dbListar([{ id: "a", name: "Ana" }], {}, {}), ORG);
    expect(r).toEqual([
      { contactId: "a", nome: "Ana", trouxe: 0, alcancou: 0, ultimaAtividadeISO: null, compartilhou: false, recebeuLink: false },
    ]);
  });

  it("nome nulo → 'Sem nome'", async () => {
    const r = await listarMultiplicadores(dbListar([{ id: "a", name: null }], {}, {}), ORG);
    expect(r[0]!.nome).toBe("Sem nome");
  });

  it("last_activity_at preserva ISO", async () => {
    const iso = "2026-10-01T12:00:00.000Z";
    const r = await listarMultiplicadores(dbListar([{ id: "a", name: "Ana", last_activity_at: iso }], {}, {}), ORG);
    expect(r[0]!.ultimaAtividadeISO).toBe(iso);
  });
});

describe("listarMultiplicadores — recebeuLink (já ganhou link pessoal de vídeo)", () => {
  const cohort = [c("a", "Ana"), c("b", "Bruno"), c("x", "Xavier")];

  it("quem tem share pessoal → recebeuLink true; os demais → false", async () => {
    const r = await listarMultiplicadores(dbListar(cohort, {}, {}, ["a", "x"]), ORG);
    const por = new Map(r.map((m) => [m.contactId, m.recebeuLink]));
    expect(por.get("a")).toBe(true);
    expect(por.get("x")).toBe(true);
    expect(por.get("b")).toBe(false);
  });

  it("sem nenhum share → todos recebeuLink false", async () => {
    const r = await listarMultiplicadores(dbListar(cohort, {}, {}, []), ORG);
    expect(r.every((m) => m.recebeuLink === false)).toBe(true);
  });

  it("recebeuLink é independente de compartilhou (recebeu o link mas 0 alcance)", async () => {
    const r = await listarMultiplicadores(dbListar([c("a", "Ana")], {}, {}, ["a"]), ORG);
    expect(r[0]!.recebeuLink).toBe(true);
    expect(r[0]!.compartilhou).toBe(false); // recebeu mas ninguém abriu ainda
  });

  it("share com sharer_contact_id nulo é ignorado (não marca ninguém)", async () => {
    const db = makeDb({
      contacts: () => ({ data: [c("a", "Ana")] }),
      pol_indicacoes: () => ({ data: [] }),
      __rpc: () => ({ data: [] }),
      pol_video_shares: () => ({ data: [{ sharer_contact_id: null }] }),
    }) as never;
    const r = await listarMultiplicadores(db, ORG);
    expect(r[0]!.recebeuLink).toBe(false);
  });
});

describe("listarMultiplicadores — trouxe (contagem de indicações) 0..8", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])("trouxe=%i", async (n) => {
    const r = await listarMultiplicadores(dbListar([{ id: "a", name: "Ana" }], { a: n }, {}), ORG);
    expect(r[0]!.trouxe).toBe(n);
  });
});

describe("listarMultiplicadores — alcancou + fronteira de compartilhou", () => {
  it.each([
    [0, false],
    [1, true],
    [2, true],
    [5, true],
    [50, true],
    [999, true],
  ])("alcancou=%i → compartilhou=%s", async (alc, esperado) => {
    const r = await listarMultiplicadores(dbListar([{ id: "a", name: "Ana" }], {}, { a: alc as number }), ORG);
    expect(r[0]!.alcancou).toBe(alc);
    expect(r[0]!.compartilhou).toBe(esperado);
  });
});

describe("listarMultiplicadores — só conta sinais de quem está no cohort", () => {
  it("indicação/alcance de quem NÃO está no cohort é ignorado no placar", async () => {
    const r = await listarMultiplicadores(
      dbListar([{ id: "a", name: "Ana" }], { a: 2, forasteiro: 9 }, { a: 3, outro: 7 }),
      ORG,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ contactId: "a", trouxe: 2, alcancou: 3 });
  });
});

describe("listarMultiplicadores — ordenação (casos explícitos)", () => {
  it("trouxe manda sobre alcance", async () => {
    const r = await listarMultiplicadores(
      dbListar(
        [
          { id: "x", name: "X" },
          { id: "y", name: "Y" },
        ],
        { x: 1, y: 5 },
        { x: 100, y: 0 },
      ),
      ORG,
    );
    expect(r.map((m) => m.contactId)).toEqual(["y", "x"]);
  });

  it("empate em trouxe → alcance desempata", async () => {
    const r = await listarMultiplicadores(
      dbListar(
        [
          { id: "x", name: "X" },
          { id: "y", name: "Y" },
        ],
        { x: 2, y: 2 },
        { x: 10, y: 40 },
      ),
      ORG,
    );
    expect(r.map((m) => m.contactId)).toEqual(["y", "x"]);
  });

  it("empate total → nome pt-BR (acento ordena como letra base)", async () => {
    const r = await listarMultiplicadores(
      dbListar(
        [
          { id: "b", name: "Bruno" },
          { id: "a", name: "Ávila" },
        ],
        { a: 1, b: 1 },
        { a: 1, b: 1 },
      ),
      ORG,
    );
    expect(r.map((m) => m.nome)).toEqual(["Ávila", "Bruno"]);
  });
});

describe("listarMultiplicadores — INVARIANTE de ordem sobre 120 cohorts aleatórios", () => {
  const rnd = lcg(20260202);
  const casos = Array.from({ length: 120 }, (_, k) => k);
  it.each(casos)("cohort aleatório #%i está ordenado pela regra", async (k) => {
    const n = 2 + Math.floor(rnd() * 7); // 2..8 pessoas
    const cohort: Cohort[] = [];
    const inds: Record<string, number> = {};
    const alc: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const id = `c${k}_${i}`;
      const nome = ["Ana", "Bruno", "Ávila", "Carlos", "Bia", "Ana", "Zé"][Math.floor(rnd() * 7)]! + i;
      cohort.push({ id, name: nome });
      inds[id] = Math.floor(rnd() * 4); // 0..3
      alc[id] = Math.floor(rnd() * 5); // 0..4
    }
    const r = await listarMultiplicadores(dbListar(cohort, inds, alc), ORG);
    expect(r).toHaveLength(n);
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1]!;
      const b = r[i]!;
      const ok =
        a.trouxe > b.trouxe ||
        (a.trouxe === b.trouxe && a.alcancou > b.alcancou) ||
        (a.trouxe === b.trouxe && a.alcancou === b.alcancou && a.nome.localeCompare(b.nome, "pt-BR") <= 0);
      expect(ok).toBe(true);
    }
  });
});

describe("sugestoesDeMultiplicador", () => {
  it("exclui quem já está no cohort", async () => {
    const r = await sugestoesDeMultiplicador(
      dbSugestoes({ a: 2, b: 1 }, {}, { a: "Ana", b: "Bruno" }),
      ORG,
      new Set(["a"]),
    );
    expect(r.map((s) => s.contactId)).toEqual(["b"]);
  });

  it("une indicadores E alcançadores (quem só alcançou também sugere)", async () => {
    const r = await sugestoesDeMultiplicador(
      dbSugestoes({ a: 1 }, { z: 5 }, { a: "Ana", z: "Zoe" }),
      ORG,
      new Set(),
    );
    expect(new Set(r.map((s) => s.contactId))).toEqual(new Set(["a", "z"]));
  });

  it("vazio quando todos já estão no cohort", async () => {
    const r = await sugestoesDeMultiplicador(
      dbSugestoes({ a: 1, b: 2 }, { a: 3 }, { a: "Ana", b: "Bruno" }),
      ORG,
      new Set(["a", "b"]),
    );
    expect(r).toEqual([]);
  });

  it("vazio quando não há sinal nenhum", async () => {
    expect(await sugestoesDeMultiplicador(dbSugestoes({}, {}, {}), ORG, new Set())).toEqual([]);
  });

  it("nome faltante → 'Sem nome'", async () => {
    const r = await sugestoesDeMultiplicador(dbSugestoes({ a: 1 }, {}, { a: null }), ORG, new Set());
    expect(r[0]!.nome).toBe("Sem nome");
  });

  it("TETO 10: 15 candidatos → exatamente 10", async () => {
    const inds: Record<string, number> = {};
    const nomes: Record<string, string> = {};
    for (let i = 0; i < 15; i++) {
      inds[`p${i}`] = i + 1;
      nomes[`p${i}`] = `P${i}`;
    }
    const r = await sugestoesDeMultiplicador(dbSugestoes(inds, {}, nomes), ORG, new Set());
    expect(r).toHaveLength(10);
  });

  it.each([1, 3, 7, 10])("≤10 candidatos (%i) → devolve todos", async (q) => {
    const inds: Record<string, number> = {};
    const nomes: Record<string, string> = {};
    for (let i = 0; i < q; i++) {
      inds[`p${i}`] = i + 1;
      nomes[`p${i}`] = `P${i}`;
    }
    const r = await sugestoesDeMultiplicador(dbSugestoes(inds, {}, nomes), ORG, new Set());
    expect(r).toHaveLength(q);
  });

  it("rank: top 10 são os de maior trouxe (desc)", async () => {
    const inds: Record<string, number> = {};
    const nomes: Record<string, string> = {};
    for (let i = 0; i < 15; i++) {
      inds[`p${i}`] = i; // p14 maior
      nomes[`p${i}`] = `P${i}`;
    }
    const r = await sugestoesDeMultiplicador(dbSugestoes(inds, {}, nomes), ORG, new Set());
    expect(r[0]!.contactId).toBe("p14");
    expect(r.map((s) => s.trouxe)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  });
});

describe("listarMultiplicadores — ordenação explícita (empates e critérios)", () => {
  const casos: [string, Cohort[], Record<string, number>, Record<string, number>, string[]][] = [
    ["trouxe puro", [c("a", "A"), c("b", "B"), c("x", "X")], { a: 3, b: 1, x: 2 }, {}, ["a", "x", "b"]],
    ["alcance desempata trouxe igual", [c("a", "A"), c("b", "B")], { a: 2, b: 2 }, { a: 5, b: 9 }, ["b", "a"]],
    ["nome desempata tudo igual", [c("b", "Bruno"), c("a", "Ana")], { a: 1, b: 1 }, { a: 1, b: 1 }, ["a", "b"]],
    ["acento como letra base (Ávila<Bruno)", [c("b", "Bruno"), c("v", "Ávila")], {}, {}, ["v", "b"]],
    ["acento como letra base (Ângela<Bianca)", [c("x", "Bianca"), c("y", "Ângela")], {}, {}, ["y", "x"]],
    ["trouxe vence alcance alto", [c("a", "A"), c("b", "B")], { a: 1, b: 0 }, { a: 0, b: 999 }, ["a", "b"]],
    ["todos zero → só nome", [c("c", "Carla"), c("a", "Ana"), c("b", "Bia")], {}, {}, ["a", "b", "c"]],
    ["mistura 3 níveis de trouxe", [c("a", "A"), c("b", "B"), c("c", "C")], { a: 1, b: 3, c: 2 }, {}, ["b", "c", "a"]],
    ["empate trouxe=0, alcance manda", [c("a", "A"), c("b", "B"), c("c", "C")], {}, { a: 1, b: 3, c: 2 }, ["b", "c", "a"]],
    ["dois empates por nome", [c("a", "Zeca"), c("b", "Bia"), c("c", "Bia")], { a: 2, b: 2, c: 2 }, { a: 1, b: 1, c: 1 }, ["b", "c", "a"]],
    ["nome com maiúscula/minúscula", [c("a", "ana"), c("b", "Bruno")], {}, {}, ["a", "b"]],
    ["trouxe alto + alcance zero no topo", [c("a", "A"), c("b", "B")], { a: 9 }, { b: 50 }, ["a", "b"]],
  ];
  it.each(casos)("%s", async (_nome, cohort, inds, alc, ordem) => {
    const r = await listarMultiplicadores(dbListar(cohort, inds, alc), ORG);
    expect(r.map((m) => m.contactId)).toEqual(ordem);
  });
});

describe("listarMultiplicadores — 2º INVARIANTE (80 cohorts grandes, mais empates/acentos)", () => {
  const rnd = lcg(77777);
  const NOMES = ["Ana", "Ávila", "Bruno", "Ângela", "Bia", "Ana", "Carlos", "Bia", "Zé", "Ávila"];
  it.each(Array.from({ length: 80 }, (_, k) => k))("cohort grande #%i ordenado pela regra", async (k) => {
    const n = 5 + Math.floor(rnd() * 11); // 5..15
    const cohort: Cohort[] = [];
    const inds: Record<string, number> = {};
    const alc: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const id = `g${k}_${i}`;
      cohort.push({ id, name: NOMES[Math.floor(rnd() * NOMES.length)]! }); // nomes repetem DE PROPÓSITO (empates)
      inds[id] = Math.floor(rnd() * 3); // 0..2 (muitos empates)
      alc[id] = Math.floor(rnd() * 3); // 0..2
    }
    const r = await listarMultiplicadores(dbListar(cohort, inds, alc), ORG);
    expect(r).toHaveLength(n);
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1]!;
      const b = r[i]!;
      const ok =
        a.trouxe > b.trouxe ||
        (a.trouxe === b.trouxe && a.alcancou > b.alcancou) ||
        (a.trouxe === b.trouxe && a.alcancou === b.alcancou && a.nome.localeCompare(b.nome, "pt-BR") <= 0);
      expect(ok).toBe(true);
    }
  });
});

/** atalho pra cohort nos casos explícitos. */
function c(id: string, name: string | null): Cohort {
  return { id, name };
}

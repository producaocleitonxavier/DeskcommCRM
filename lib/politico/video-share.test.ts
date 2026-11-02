import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeDb, type Op, type FakeResult } from "@/tests/fake/fake-supabase";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://ex.com" } }));

import { env } from "@/lib/env";
import {
  urlDoVideoShare,
  hashVisitante,
  obterOuCriarShare,
  registrarCliqueVideo,
} from "./video-share";

const ORG = "org-1";

describe("urlDoVideoShare — base configurada vs relativa", () => {
  const original = env.NEXT_PUBLIC_APP_URL;
  afterEach(() => {
    (env as { NEXT_PUBLIC_APP_URL: string }).NEXT_PUBLIC_APP_URL = original;
  });

  it.each([
    ["https://ex.com", "abc", "https://ex.com/api/v1/vid/abc"],
    ["https://ex.com/", "abc", "https://ex.com/api/v1/vid/abc"], // tira barra final
    ["https://ex.com///", "xyz", "https://ex.com/api/v1/vid/xyz"],
    ["https://warromcleitonxavier.cloud", "s1", "https://warromcleitonxavier.cloud/api/v1/vid/s1"],
  ])("base=%s id=%s → %s", (base, id, esperado) => {
    (env as { NEXT_PUBLIC_APP_URL: string }).NEXT_PUBLIC_APP_URL = base;
    expect(urlDoVideoShare(id)).toBe(esperado);
  });

  it.each([
    ["", "abc"],
    ["https://placeholder.invalid", "abc"], // placeholder = inutilizável → relativo
    ["https://sub.placeholder.invalid/x", "abc"],
  ])("base inutilizável (%s) → caminho relativo", (base, id) => {
    (env as { NEXT_PUBLIC_APP_URL: string }).NEXT_PUBLIC_APP_URL = base;
    expect(urlDoVideoShare(id)).toBe(`/api/v1/vid/${id}`);
  });
});

describe("hashVisitante — determinístico, 32 hex, por ip+ua+dia", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const pares: [string | null, string | null][] = [
    ["1.1.1.1", "Mozilla"],
    ["2.2.2.2", "Chrome"],
    ["200.158.0.1", "Safari/iPhone"],
    [null, "ua-sem-ip"],
    ["ip-sem-ua", null],
    [null, null],
    ["::1", "curl/8"],
    ["10.0.0.9", "Android WebView"],
  ];

  it.each(pares)("determinístico no mesmo dia: ip=%s ua=%s", (ip, ua) => {
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));
    const a = hashVisitante(ip, ua);
    const b = hashVisitante(ip, ua);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each([
    ["1.1.1.1", "2.2.2.2", "mesmo-ua"],
    ["mesmo-ip", "mesmo-ip", "ua-A"],
  ])("ips/uas diferentes → hashes diferentes", (a, b) => {
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));
    expect(hashVisitante(a as string, "X")).not.toBe(hashVisitante(b as string, "Y"));
  });

  it("muda no dia seguinte (mesmo ip+ua)", () => {
    vi.setSystemTime(new Date("2026-02-02T23:59:00Z"));
    const dia1 = hashVisitante("1.2.3.4", "UA");
    vi.setSystemTime(new Date("2026-02-03T00:01:00Z"));
    const dia2 = hashVisitante("1.2.3.4", "UA");
    expect(dia1).not.toBe(dia2);
  });

  it("null e '?' colidem DE PROPÓSITO (null vira '?')", () => {
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));
    expect(hashVisitante(null, "UA")).toBe(hashVisitante("?", "UA"));
  });
});

/** pol_video_shares com roteiro stateful (achar → inserir → relê). */
function dbShares(roteiro: { achar: FakeResult[]; inserir?: FakeResult }) {
  let acharIdx = 0;
  return makeDb({
    pol_video_shares: (ops: Op[]): FakeResult => {
      if (ops.some((o) => o.m === "insert")) return roteiro.inserir ?? { data: null, error: null };
      const r = roteiro.achar[Math.min(acharIdx, roteiro.achar.length - 1)]!;
      acharIdx++;
      return r;
    },
  });
}

describe("obterOuCriarShare — pega-ou-cria (base vs pessoal), corrida, falha", () => {
  it("já existe → devolve o id SEM inserir", async () => {
    const db = dbShares({ achar: [{ data: { id: "ja-existe" } }] });
    const id = await obterOuCriarShare(db as never, { organizationId: ORG, materialId: "m1", contactId: null });
    expect(id).toBe("ja-existe");
    expect(db.__calls.some((c) => c.ops?.some((o) => o.m === "insert"))).toBe(false);
  });

  it("não existe → insere e devolve o novo id", async () => {
    const db = dbShares({ achar: [{ data: null }], inserir: { data: { id: "novo" }, error: null } });
    const id = await obterOuCriarShare(db as never, { organizationId: ORG, materialId: "m1", contactId: "c1" });
    expect(id).toBe("novo");
  });

  it("link PESSOAL filtra por sharer_contact_id (eq), link BASE por is null", async () => {
    const db = dbShares({ achar: [{ data: { id: "p" } }] });
    await obterOuCriarShare(db as never, { organizationId: ORG, materialId: "m1", contactId: "c9" });
    const sel = db.__calls.find((c) => c.table === "pol_video_shares")!;
    expect(sel.ops!.some((o) => o.m === "eq" && o.args[0] === "sharer_contact_id" && o.args[1] === "c9")).toBe(true);

    const db2 = dbShares({ achar: [{ data: { id: "b" } }] });
    await obterOuCriarShare(db2 as never, { organizationId: ORG, materialId: "m1", contactId: null });
    const sel2 = db2.__calls.find((c) => c.table === "pol_video_shares")!;
    expect(sel2.ops!.some((o) => o.m === "is" && o.args[0] === "sharer_contact_id")).toBe(true);
  });

  it("corrida 23505 no insert → relê e devolve o id do vencedor", async () => {
    const db = dbShares({
      achar: [{ data: null }, { data: { id: "vencedor" } }],
      inserir: { data: null, error: { message: "dup", code: "23505" } },
    });
    const id = await obterOuCriarShare(db as never, { organizationId: ORG, materialId: "m1", contactId: "c1" });
    expect(id).toBe("vencedor");
  });

  it("23505 mas relê também vazio → null", async () => {
    const db = dbShares({
      achar: [{ data: null }, { data: null }],
      inserir: { data: null, error: { message: "dup", code: "23505" } },
    });
    const id = await obterOuCriarShare(db as never, { organizationId: ORG, materialId: "m1", contactId: "c1" });
    expect(id).toBeNull();
  });

  it("erro NÃO-23505 no insert → null (fail-soft, catch)", async () => {
    const db = dbShares({
      achar: [{ data: null }],
      inserir: { data: null, error: { message: "boom", code: "42501" } },
    });
    const id = await obterOuCriarShare(db as never, { organizationId: ORG, materialId: "m1", contactId: "c1" });
    expect(id).toBeNull();
  });

  it("insert sem erro e sem data → null", async () => {
    const db = dbShares({ achar: [{ data: null }], inserir: { data: null, error: null } });
    const id = await obterOuCriarShare(db as never, { organizationId: ORG, materialId: "m1", contactId: "c1" });
    expect(id).toBeNull();
  });
});

describe("registrarCliqueVideo — idempotente e fail-soft", () => {
  function dbCliques(res: FakeResult) {
    return makeDb({ pol_video_cliques: () => res });
  }
  it("inserção OK → contou:true", async () => {
    const db = dbCliques({ error: null });
    expect(await registrarCliqueVideo(db as never, { shareId: "s", organizationId: ORG, visitorHash: "h" })).toEqual({
      contou: true,
    });
  });
  it("23505 (mesmo visitante/dia) → contou:false SEM lançar", async () => {
    const db = dbCliques({ error: { message: "dup", code: "23505" } });
    expect(await registrarCliqueVideo(db as never, { shareId: "s", organizationId: ORG, visitorHash: "h" })).toEqual({
      contou: false,
    });
  });
  it.each(["42501", "23503", "XX000"])("erro real (%s) → contou:false (catch)", async (code) => {
    const db = dbCliques({ error: { message: "boom", code } });
    expect(await registrarCliqueVideo(db as never, { shareId: "s", organizationId: ORG, visitorHash: "h" })).toEqual({
      contou: false,
    });
  });
});

import { describe, expect, it } from "vitest";

import { makeDb, temOp, type Op, type FakeResult, type FakeDb } from "@/tests/fake/fake-supabase";
import { enrolarLiderancaComoMultiplicador, TAG_LIDERANCA } from "@/lib/politico/lideranca-multiplicador";
import { TAG_MULTIPLICADOR } from "@/lib/politico/multiplicadores";
import { TAG_DIVULGADOR } from "@/lib/politico/divulgador";

const ORG = "org-1";
const FONE_OK = "+5531999998888"; // +55, 13 dígitos, DDD 31 → plausível

/**
 * Handler de `contacts` que decide pelo tipo de operação da cadeia:
 * insert → cria (novoId); ilike → busca por telefone (achadoPorFone); update →
 * grava tags (ok); select tags → devolve tagsExistentes.
 */
function contatos(cfg: {
  tagsExistentes?: string[];
  achadoPorFone?: { id: string } | null;
  novoId?: string;
}) {
  return (ops: Op[]): FakeResult => {
    if (temOp(ops, "insert")) return { data: { id: cfg.novoId ?? "C-NOVO" } };
    if (temOp(ops, "ilike")) return { data: cfg.achadoPorFone ?? null };
    if (temOp(ops, "update")) return { data: null };
    return { data: { tags: cfg.tagsExistentes ?? [] } };
  };
}

/** Tags gravadas na ÚNICA chamada de update em `contacts` (a marcação). */
function tagsGravadas(db: FakeDb): string[] | undefined {
  const call = db.__calls.find((c) => c.table === "contacts" && c.ops?.some((o) => o.m === "update"));
  const upd = call?.ops?.find((o) => o.m === "update");
  return (upd?.args[0] as { tags?: string[] } | undefined)?.tags;
}

/** O contact_id gravado de volta na liderança (link), se houve. */
function linkDeVolta(db: FakeDb): string | undefined {
  const call = db.__calls.find((c) => c.table === "pol_liderancas");
  const upd = call?.ops?.find((o) => o.m === "update");
  return (upd?.args[0] as { contact_id?: string } | undefined)?.contact_id;
}

describe("enrolarLiderancaComoMultiplicador — com contato vinculado", () => {
  it("só marca o contato (multiplicador+divulgador+lideranca), sem linkar de volta", async () => {
    const db = makeDb({ contacts: contatos({ tagsExistentes: [] }) });
    const r = await enrolarLiderancaComoMultiplicador(db as never, ORG, {
      liderancaId: "L1",
      contactId: "C1",
      whatsapp: null,
      nome: "Ana Souza",
    });
    expect(r).toEqual({ contactId: "C1" });
    expect(tagsGravadas(db)).toEqual([TAG_MULTIPLICADOR, TAG_DIVULGADOR, TAG_LIDERANCA]);
    expect(db.__calls.some((c) => c.table === "pol_liderancas")).toBe(false);
    expect(db.__calls.some((c) => c.table === "contacts" && c.ops?.some((o) => o.m === "ilike"))).toBe(false);
    expect(db.__calls.some((c) => c.table === "contacts" && c.ops?.some((o) => o.m === "insert"))).toBe(false);
  });

  it("preserva as tags existentes e não duplica", async () => {
    const db = makeDb({ contacts: contatos({ tagsExistentes: ["vip", TAG_MULTIPLICADOR] }) });
    await enrolarLiderancaComoMultiplicador(db as never, ORG, { liderancaId: "L1", contactId: "C1", whatsapp: null, nome: "X" });
    expect(tagsGravadas(db)).toEqual(["vip", TAG_MULTIPLICADOR, TAG_DIVULGADOR, TAG_LIDERANCA]);
  });

  it("já tem as 3 tags → NÃO grava (idempotente)", async () => {
    const db = makeDb({ contacts: contatos({ tagsExistentes: [TAG_MULTIPLICADOR, TAG_DIVULGADOR, TAG_LIDERANCA] }) });
    const r = await enrolarLiderancaComoMultiplicador(db as never, ORG, { liderancaId: "L1", contactId: "C1", whatsapp: null, nome: "X" });
    expect(r).toEqual({ contactId: "C1" });
    expect(tagsGravadas(db)).toBeUndefined();
  });

  it("tags nulas no banco → cria do zero com as 3", async () => {
    const db = makeDb({ contacts: () => ({ data: { tags: null } }) });
    await enrolarLiderancaComoMultiplicador(db as never, ORG, { liderancaId: "L1", contactId: "C1", whatsapp: null, nome: "X" });
    expect(tagsGravadas(db)).toEqual([TAG_MULTIPLICADOR, TAG_DIVULGADOR, TAG_LIDERANCA]);
  });
});

describe("enrolarLiderancaComoMultiplicador — sem contato, pelo whatsapp", () => {
  it("acha contato existente pelo telefone, marca e linka de volta", async () => {
    const db = makeDb({
      contacts: contatos({ achadoPorFone: { id: "C-ACHADO" }, tagsExistentes: [] }),
      pol_liderancas: () => ({ data: null }),
    });
    const r = await enrolarLiderancaComoMultiplicador(db as never, ORG, {
      liderancaId: "L1",
      contactId: null,
      whatsapp: FONE_OK,
      nome: "Ana",
    });
    expect(r).toEqual({ contactId: "C-ACHADO" });
    expect(tagsGravadas(db)).toEqual([TAG_MULTIPLICADOR, TAG_DIVULGADOR, TAG_LIDERANCA]);
    expect(linkDeVolta(db)).toBe("C-ACHADO");
  });

  it("sem contato existente → CRIA contato (nome+telefone), marca e linka", async () => {
    const db = makeDb({
      contacts: contatos({ achadoPorFone: null, novoId: "C-NOVO", tagsExistentes: [] }),
      pol_liderancas: () => ({ data: null }),
    });
    const r = await enrolarLiderancaComoMultiplicador(db as never, ORG, {
      liderancaId: "L1",
      contactId: null,
      whatsapp: FONE_OK,
      nome: "Bruno Lima",
    });
    expect(r).toEqual({ contactId: "C-NOVO" });
    const insCall = db.__calls.find((c) => c.table === "contacts" && c.ops?.some((o) => o.m === "insert"));
    const ins = insCall?.ops?.find((o) => o.m === "insert")?.args[0] as { name?: string; phone_number?: string; organization_id?: string };
    expect(ins?.name).toBe("Bruno Lima");
    expect(ins?.phone_number).toBe(FONE_OK);
    expect(ins?.organization_id).toBe(ORG);
    expect(linkDeVolta(db)).toBe("C-NOVO");
    expect(tagsGravadas(db)).toEqual([TAG_MULTIPLICADOR, TAG_DIVULGADOR, TAG_LIDERANCA]);
  });

  it("nome vazio → cria com nome 'Liderança'", async () => {
    const db = makeDb({
      contacts: contatos({ achadoPorFone: null, novoId: "C-NOVO", tagsExistentes: [] }),
      pol_liderancas: () => ({ data: null }),
    });
    await enrolarLiderancaComoMultiplicador(db as never, ORG, { liderancaId: "L1", contactId: null, whatsapp: FONE_OK, nome: null });
    const insCall = db.__calls.find((c) => c.table === "contacts" && c.ops?.some((o) => o.m === "insert"));
    const ins = insCall?.ops?.find((o) => o.m === "insert")?.args[0] as { name?: string };
    expect(ins?.name).toBe("Liderança");
  });
});

describe("enrolarLiderancaComoMultiplicador — no-op e fail-soft", () => {
  const invalidos: [string, string | null][] = [
    ["whatsapp nulo", null],
    ["vazio", ""],
    ["curto demais", "+5531999"],
    ["só dígitos soltos", "999"],
  ];
  it.each(invalidos)("sem contato e whatsapp %s → no-op (não toca banco)", async (_rotulo, wa) => {
    const db = makeDb({ contacts: contatos({}) });
    const r = await enrolarLiderancaComoMultiplicador(db as never, ORG, { liderancaId: "L1", contactId: null, whatsapp: wa, nome: "X" });
    expect(r).toEqual({ contactId: null });
    expect(db.__calls.length).toBe(0);
  });

  // normalizePhoneBR aceita whatsapp CRU (sem +) — o caso NORMAL do form da
  // liderança ("5531..."/"31..."): normaliza pra E.164 e ENROLA (acha ou cria).
  it.each([
    ["sem + com 55", "5531999998888"],
    ["sem código de país (DDD+numero)", "31999998888"],
  ])("sem contato e whatsapp %s → normaliza e enrola (cria contato)", async (_rotulo, wa) => {
    const db = makeDb({ contacts: contatos({ achadoPorFone: null, novoId: "C-NOVO", tagsExistentes: [] }) });
    const r = await enrolarLiderancaComoMultiplicador(db as never, ORG, { liderancaId: "L1", contactId: null, whatsapp: wa, nome: "Fulano" });
    expect(r).toEqual({ contactId: "C-NOVO" });
    expect(tagsGravadas(db)).toEqual([TAG_MULTIPLICADOR, TAG_DIVULGADOR, TAG_LIDERANCA]);
  });

  it("erro de banco na leitura → fail-soft, retorna {contactId:null} (não lança)", async () => {
    const db = makeDb({
      contacts: () => {
        throw new Error("db down");
      },
    });
    const r = await enrolarLiderancaComoMultiplicador(db as never, ORG, { liderancaId: "L1", contactId: "C1", whatsapp: null, nome: "X" });
    expect(r).toEqual({ contactId: null });
  });

  it("falha ao criar contato (insert devolve null) → no-op sem marcar", async () => {
    const db = makeDb({
      contacts: (ops) => {
        if (temOp(ops, "insert")) return { data: null };
        if (temOp(ops, "ilike")) return { data: null };
        return { data: { tags: [] } };
      },
      pol_liderancas: () => ({ data: null }),
    });
    const r = await enrolarLiderancaComoMultiplicador(db as never, ORG, { liderancaId: "L1", contactId: null, whatsapp: FONE_OK, nome: "X" });
    expect(r).toEqual({ contactId: null });
    // não chegou a linkar nem marcar
    expect(db.__calls.some((c) => c.table === "pol_liderancas")).toBe(false);
    expect(tagsGravadas(db)).toBeUndefined();
  });
});

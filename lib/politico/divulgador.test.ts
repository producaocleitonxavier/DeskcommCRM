import { beforeEach, describe, expect, it, vi } from "vitest";

import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { makeDb, temOp, acharOp } from "@/tests/fake/fake-supabase";
import {
  ehAfirmativo,
  ehNegativo,
  processarAceiteDivulgador,
  contarElegiveisParaConvite,
  listarElegiveisParaConvite,
  TAG_DIVULGADOR_CONVIDADO,
  TAG_DIVULGADOR_RECUSOU,
} from "./divulgador";

vi.mock("@/lib/atendimento/origem", () => ({ beginServiceAtOrigin: vi.fn() }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));

const ORG = "org-1";
const TAG_MULT = "multiplicador";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(beginServiceAtOrigin).mockResolvedValue({ conversation_id: "conv-1" } as never);
  vi.mocked(sendMessageHandler).mockResolvedValue(undefined as never);
});

// ──────────────────────────── ehAfirmativo ────────────────────────────
describe("ehAfirmativo", () => {
  it.each([
    "sim", "SIM", "Sim!", "sim.", "  sim  ", "quero", "Quero", "aceito", "aceita",
    "claro", "bora", "pode", "pode ser", "positivo", "topo", "vamos", "aceitar",
    "quero sim", "com certeza", "to dentro", "estou dentro", "👍", "sim 👍", "aceito, pode mandar",
  ])("afirmativo: %j", (t) => expect(ehAfirmativo(t)).toBe(true));

  it.each([
    "", "   ", "assim", "simplesmente", "talvez", "nao", "não", "depois",
    "quem sabe", "me liga", "obrigado", "assim que der",
  ])("NÃO afirmativo: %j", (t) => expect(ehAfirmativo(t)).toBe(false));
});

// ──────────────────────────── ehNegativo ────────────────────────────
describe("ehNegativo", () => {
  it.each([
    "nao", "não", "NÃO", "não quero", "nao quero", "agora não", "agora nao",
    "depois", "dispenso", "cancelar", "sair", "parar", "não, obrigado",
  ])("negativo: %j", (t) => expect(ehNegativo(t)).toBe(true));

  it.each(["sim", "quero", "claro", "assim", "", "aceito", "👍", "com certeza"])(
    "NÃO negativo: %j",
    (t) => expect(ehNegativo(t)).toBe(false),
  );
});

it("'não quero' é afirmativo E negativo — o negativo vence no processamento", () => {
  expect(ehAfirmativo("não quero")).toBe(true); // tem o token "quero"
  expect(ehNegativo("não quero")).toBe(true); // mas tem "nao" / frase "nao quero"
});

// ──────────────────── processarAceiteDivulgador ────────────────────
function adminCom(contato: { id: string; name: string | null; tags: string[] | null } | null) {
  return makeDb({
    contacts: (ops) => {
      if (temOp(ops, "update")) return { error: null };
      return { data: contato };
    },
  });
}
/** Tags do update gravado em contacts (ou null se não houve update). */
function tagsGravadas(admin: ReturnType<typeof makeDb>): string[] | null {
  const upd = admin.__calls.find((c) => c.table === "contacts" && (c.ops ?? []).some((o) => o.m === "update"));
  if (!upd) return null;
  const op = acharOp(upd.ops!, "update")!;
  return (op.args[0] as { tags: string[] }).tags;
}

describe("processarAceiteDivulgador", () => {
  it("não convidado (sem a tag) → skipped, não grava nada", async () => {
    const admin = adminCom({ id: "c1", name: "Ana", tags: ["vip"] });
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "c1", texto: "sim", canalId: "ch1" });
    expect(r).toEqual({ status: "skipped", detail: "não convidado" });
    expect(tagsGravadas(admin)).toBeNull();
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("contato inexistente → skipped", async () => {
    const admin = adminCom(null);
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "x", texto: "sim", canalId: "ch1" });
    expect(r.status).toBe("skipped");
  });

  it.each([null, "", "   "])("convidado + texto vazio (%j) → skipped sem texto", async (texto) => {
    const admin = adminCom({ id: "c1", name: "Ana", tags: [TAG_DIVULGADOR_CONVIDADO] });
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "c1", texto, canalId: "ch1" });
    expect(r).toEqual({ status: "skipped", detail: "sem texto" });
    expect(tagsGravadas(admin)).toBeNull();
  });

  it("convidado + SIM → aceitou: vira multiplicador (tira convidado) + confirmação", async () => {
    const admin = adminCom({ id: "c1", name: "Ana Paula", tags: [TAG_DIVULGADOR_CONVIDADO, "vip"] });
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "c1", texto: "Sim, quero!", canalId: "ch1" });
    expect(r).toEqual({ status: "done", detail: "aceitou" });
    const tags = tagsGravadas(admin)!;
    expect(tags).toContain(TAG_MULT);
    expect(tags).toContain("vip"); // preserva outras
    expect(tags).not.toContain(TAG_DIVULGADOR_CONVIDADO);
    // confirmação enviada (1ª mensagem), com o 1º nome
    expect(sendMessageHandler).toHaveBeenCalledTimes(1);
    const body = (vi.mocked(sendMessageHandler).mock.calls[0]![2] as { body: string }).body;
    expect(body).toContain("Ana");
    expect(body).not.toContain("Paula");
  });

  it("convidado + SIM mas canalId null → aceitou, sem confirmação", async () => {
    const admin = adminCom({ id: "c1", name: "Ana", tags: [TAG_DIVULGADOR_CONVIDADO] });
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "c1", texto: "sim", canalId: null });
    expect(r).toEqual({ status: "done", detail: "aceitou" });
    expect(tagsGravadas(admin)).toContain(TAG_MULT);
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("convidado + 'não quero' → recusou (tag recusou, NÃO multiplicador), sem mensagem", async () => {
    const admin = adminCom({ id: "c1", name: "Ana", tags: [TAG_DIVULGADOR_CONVIDADO] });
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "c1", texto: "não quero, obrigado", canalId: "ch1" });
    expect(r).toEqual({ status: "done", detail: "recusou" });
    const tags = tagsGravadas(admin)!;
    expect(tags).toContain(TAG_DIVULGADOR_RECUSOU);
    expect(tags).not.toContain(TAG_MULT);
    expect(tags).not.toContain(TAG_DIVULGADOR_CONVIDADO);
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it.each(["talvez", "quem sabe", "me explica melhor"])("convidado + ambíguo (%j) → skipped, segue pendente", async (texto) => {
    const admin = adminCom({ id: "c1", name: "Ana", tags: [TAG_DIVULGADOR_CONVIDADO] });
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "c1", texto, canalId: "ch1" });
    expect(r.status).toBe("skipped");
    expect(tagsGravadas(admin)).toBeNull(); // segue convidado, nada mudou
  });

  it("confirmação best-effort: se o envio falha, o aceite ainda vale", async () => {
    vi.mocked(sendMessageHandler).mockRejectedValueOnce(new Error("waha caiu"));
    const admin = adminCom({ id: "c1", name: "Ana", tags: [TAG_DIVULGADOR_CONVIDADO] });
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "c1", texto: "sim", canalId: "ch1" });
    expect(r).toEqual({ status: "done", detail: "aceitou" });
    expect(tagsGravadas(admin)).toContain(TAG_MULT);
  });

  it("fail-soft: erro ao ler o contato → failed (não lança)", async () => {
    const admin = makeDb({ contacts: () => { throw new Error("db fora"); } });
    const r = await processarAceiteDivulgador(admin as never, { organizationId: ORG, contactId: "c1", texto: "sim", canalId: "ch1" });
    expect(r.status).toBe("failed");
  });
});

// ──────────────── elegíveis (contar / listar) ────────────────
function lead(id: string, tags: string[] = [], phone: string | null = "+5531988887777") {
  return { contact_id: id, contacts: { id, name: `Nome ${id}`, phone_number: phone, tags } };
}
function dbComLeads(rows: unknown[]) {
  return makeDb({ pol_leads: () => ({ data: rows }) });
}

describe("elegíveis para convite", () => {
  it("conta só quem tem telefone e nenhuma tag bloqueada", async () => {
    const db = dbComLeads([
      lead("a"), // ok
      lead("b", ["multiplicador"]), // já é multiplicador → fora
      lead("c", [TAG_DIVULGADOR_CONVIDADO]), // já convidado → fora
      lead("d", [TAG_DIVULGADOR_RECUSOU]), // recusou → fora
      lead("e", [], null), // sem telefone → fora
      lead("f", ["vip"]), // ok (tag irrelevante)
    ]);
    expect(await contarElegiveisParaConvite(db as never, ORG)).toBe(2); // a, f
  });

  it("dedup por contato", async () => {
    const db = dbComLeads([lead("a"), lead("a"), lead("b")]);
    expect(await contarElegiveisParaConvite(db as never, ORG)).toBe(2);
  });

  it("listar respeita o limite", async () => {
    const db = dbComLeads([lead("a"), lead("b"), lead("c"), lead("d")]);
    const r = await listarElegiveisParaConvite(db as never, ORG, 2);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("filtra por apoiador+ e opt_out=false na query", async () => {
    const db = dbComLeads([lead("a")]);
    await contarElegiveisParaConvite(db as never, ORG);
    const call = db.__calls.find((c) => c.table === "pol_leads")!;
    expect(call.ops!.some((o) => o.m === "in" && o.args[0] === "support_level")).toBe(true);
    expect(call.ops!.some((o) => o.m === "eq" && o.args[0] === "opt_out" && o.args[1] === false)).toBe(true);
    expect(call.ops!.some((o) => o.m === "eq" && o.args[0] === "organization_id" && o.args[1] === ORG)).toBe(true);
  });

  it("base vazia → 0", async () => {
    expect(await contarElegiveisParaConvite(dbComLeads([]) as never, ORG)).toBe(0);
  });
});

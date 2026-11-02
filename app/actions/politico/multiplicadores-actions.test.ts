import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { makeDb, type FakeResult } from "@/tests/fake/fake-supabase";
import {
  adicionarMultiplicador,
  removerMultiplicador,
  buscarContatosParaMarcar,
} from "./multiplicadores-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));

const ORG = "org-xyz";
const TAG = "multiplicador";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ id: "u1" } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG } as never);
});

/** db de contacts: 1 leitura (maybeSingle) + 1 update; search por ilike. */
function dbContacts(opts: {
  contato?: { id: string; tags: string[] | null } | null;
  erroLeitura?: { message: string };
  erroUpdate?: { message: string };
  search?: { id: string; name: string | null; phone_number: string | null; tags: string[] | null }[];
}) {
  return makeDb({
    contacts: (ops): FakeResult => {
      if (ops.some((o) => o.m === "update")) return { error: opts.erroUpdate ?? null };
      if (ops.some((o) => o.m === "ilike")) return { data: opts.search ?? [] };
      if (opts.erroLeitura) return { data: null, error: opts.erroLeitura };
      return { data: opts.contato ?? null, error: null };
    },
  });
}
function tagsEnviadas(db: ReturnType<typeof makeDb>): string[] | undefined {
  const upd = db.__calls.find((c) => c.table === "contacts" && c.ops?.some((o) => o.m === "update"));
  const arg = upd?.ops?.find((o) => o.m === "update")?.args[0] as { tags?: string[] } | undefined;
  return arg?.tags;
}

describe("adicionarMultiplicador", () => {
  it.each([
    [[], [TAG]],
    [["vip"], ["vip", TAG]],
    [["a", "b", "c"], ["a", "b", "c", TAG]],
    [null, [TAG]], // tags null no banco
  ])("tags iniciais %j → grava %j (adiciona sem perder as outras)", async (iniciais, esperado) => {
    const db = dbContacts({ contato: { id: "c1", tags: iniciais as string[] | null } });
    vi.mocked(createClient).mockResolvedValue(db as never);
    const r = await adicionarMultiplicador("c1");
    expect(r).toEqual({ ok: true });
    expect(tagsEnviadas(db)).toEqual(esperado);
  });

  it.each([[[TAG]], [["vip", TAG]], [[TAG, "x", "y"]]])(
    "já tem a tag (%j) → NÃO duplica",
    async (iniciais) => {
      const db = dbContacts({ contato: { id: "c1", tags: iniciais as string[] } });
      vi.mocked(createClient).mockResolvedValue(db as never);
      await adicionarMultiplicador("c1");
      const t = tagsEnviadas(db)!;
      expect(t.filter((x) => x === TAG)).toHaveLength(1);
      // preserva as demais
      for (const outra of (iniciais as string[]).filter((x) => x !== TAG)) expect(t).toContain(outra);
    },
  );

  it("contato não encontrado → ok:false e NÃO faz update", async () => {
    const db = dbContacts({ contato: null });
    vi.mocked(createClient).mockResolvedValue(db as never);
    const r = await adicionarMultiplicador("c1");
    expect(r).toEqual({ ok: false, erro: "Pessoa não encontrada." });
    expect(tagsEnviadas(db)).toBeUndefined();
  });

  it("erro de leitura → repassa a mensagem, sem update", async () => {
    const db = dbContacts({ erroLeitura: { message: "boom-read" } });
    vi.mocked(createClient).mockResolvedValue(db as never);
    const r = await adicionarMultiplicador("c1");
    expect(r).toEqual({ ok: false, erro: "boom-read" });
    expect(tagsEnviadas(db)).toBeUndefined();
  });

  it("erro no update → ok:false com a mensagem", async () => {
    const db = dbContacts({ contato: { id: "c1", tags: [] }, erroUpdate: { message: "boom-upd" } });
    vi.mocked(createClient).mockResolvedValue(db as never);
    const r = await adicionarMultiplicador("c1");
    expect(r).toEqual({ ok: false, erro: "boom-upd" });
  });

  it.each(["", "   "])("id vazio (%j) → 'Contato inválido.' sem tocar auth/banco", async (id) => {
    const r = await adicionarMultiplicador(id);
    expect(r).toEqual({ ok: false, erro: "Contato inválido." });
    expect(requireAuth).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("sem organização → ok:false e NÃO cria client", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null as never);
    const r = await adicionarMultiplicador("c1");
    expect(r).toEqual({ ok: false, erro: "Sessão ou organização inválida." });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("escopa a escrita por org E id (filtros aplicados)", async () => {
    const db = dbContacts({ contato: { id: "c1", tags: [] } });
    vi.mocked(createClient).mockResolvedValue(db as never);
    await adicionarMultiplicador("c1");
    const upd = db.__calls.find((c) => c.table === "contacts" && c.ops?.some((o) => o.m === "update"))!;
    const eqs = upd.ops!.filter((o) => o.m === "eq").map((o) => o.args);
    expect(eqs).toEqual(expect.arrayContaining([["id", "c1"], ["organization_id", ORG]]));
  });
});

describe("removerMultiplicador", () => {
  it.each([
    [[TAG], []],
    [["vip", TAG], ["vip"]],
    [[TAG, "a", "b"], ["a", "b"]],
    [["vip"], ["vip"]], // não tinha a tag → no-op, mantém
    [[], []],
    [null, []],
  ])("tags %j → grava %j (remove a tag, mantém o resto)", async (iniciais, esperado) => {
    const db = dbContacts({ contato: { id: "c1", tags: iniciais as string[] | null } });
    vi.mocked(createClient).mockResolvedValue(db as never);
    const r = await removerMultiplicador("c1");
    expect(r).toEqual({ ok: true });
    expect(tagsEnviadas(db)).toEqual(esperado);
  });

  it("id vazio → inválido", async () => {
    expect(await removerMultiplicador("  ")).toEqual({ ok: false, erro: "Contato inválido." });
  });
});

describe("buscarContatosParaMarcar", () => {
  it.each(["", "a", " x "])("termo curto (%j) → [] sem tocar banco", async (termo) => {
    expect(await buscarContatosParaMarcar(termo)).toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("filtra quem JÁ é multiplicador e mapeia nome/telefone", async () => {
    const db = dbContacts({
      search: [
        { id: "1", name: "Ana", phone_number: "+5531900000001", tags: [] },
        { id: "2", name: "Bruno", phone_number: null, tags: [TAG] }, // já é → fora
        { id: "3", name: null, phone_number: "+5531900000003", tags: ["vip"] },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(db as never);
    const r = await buscarContatosParaMarcar("an");
    expect(r).toEqual([
      { id: "1", nome: "Ana", telefone: "+5531900000001" },
      { id: "3", nome: "Sem nome", telefone: "+5531900000003" },
    ]);
  });

  it("sem organização → []", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null as never);
    expect(await buscarContatosParaMarcar("ana")).toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("usa ilike por nome e teto de 12 no resultado", async () => {
    const search = Array.from({ length: 20 }, (_, i) => ({
      id: `id${i}`,
      name: `Pessoa ${i}`,
      phone_number: null,
      tags: [] as string[],
    }));
    const db = dbContacts({ search });
    vi.mocked(createClient).mockResolvedValue(db as never);
    const r = await buscarContatosParaMarcar("pessoa");
    expect(r).toHaveLength(12);
    const call = db.__calls.find((c) => c.table === "contacts" && c.ops?.some((o) => o.m === "ilike"))!;
    expect(call.ops!.some((o) => o.m === "ilike" && o.args[0] === "name")).toBe(true);
  });
});

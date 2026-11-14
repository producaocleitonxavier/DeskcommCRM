import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { makeDb, temOp, acharOp } from "@/tests/fake/fake-supabase";
import { contarElegiveis, convidarDivulgadores } from "./divulgador-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/messaging/open-shared-contact-conversation", () => ({ openSharedContactConversation: vi.fn() }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));

const ORG = "org-1";
const FONE = "+5531988887777";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ id: "u1", idioma: "pt" } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG } as never);
  vi.mocked(openSharedContactConversation).mockImplementation(
    async (_a, _o, e: { contact_id: string }) => ({ conversation_id: `conv-${e.contact_id}` }) as never,
  );
  vi.mocked(sendMessageHandler).mockResolvedValue(undefined as never);
});

function lead(id: string, tags: string[] = [], phone: string | null = FONE) {
  return { contact_id: id, contacts: { id, name: `Nome ${id}`, phone_number: phone, tags } };
}

/** db (pol_leads = elegíveis) + admin (contacts: select tags + update). */
function montar(leads: unknown[]) {
  const db = makeDb({ pol_leads: () => ({ data: leads }) });
  const admin = makeDb({
    contacts: (ops) => (temOp(ops, "update") ? { error: null } : { data: { tags: [] } }),
  });
  vi.mocked(createClient).mockResolvedValue(db as never);
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return { db, admin };
}

describe("contarElegiveis", () => {
  it("conta os elegíveis", async () => {
    montar([lead("a"), lead("b"), lead("c", ["multiplicador"])]);
    expect(await contarElegiveis()).toBe(2);
  });
  it("sem org → 0, sem tocar o banco", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null as never);
    expect(await contarElegiveis()).toBe(0);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("convidarDivulgadores", () => {
  it("sem org → ok:false", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null as never);
    expect(await convidarDivulgadores()).toEqual({ ok: false, erro: "Sessão ou organização inválida." });
  });

  it("nenhum elegível → ok:false", async () => {
    montar([]);
    const r = await convidarDivulgadores();
    expect(r).toEqual({ ok: false, erro: "Ninguém elegível pra convidar agora." });
  });

  it("caminho feliz: convida todos, manda convite e marca a tag", async () => {
    const { admin } = montar([lead("a"), lead("b")]);
    const r = await convidarDivulgadores();
    expect(r).toEqual({ ok: true, total: 2, convidados: 2, pulados: [] });
    // um convite por contato
    expect(sendMessageHandler).toHaveBeenCalledTimes(2);
    const body = (vi.mocked(sendMessageHandler).mock.calls[0]![2] as { body: string }).body;
    expect(body).toContain("SIM");
    expect(body).toContain("Nome a".split(" ")[0]!); // 1º nome ("Nome")
    // marcou divulgador_convidado nos dois (update em contacts)
    const updates = admin.__calls.filter((c) => c.table === "contacts" && (c.ops ?? []).some((o) => o.m === "update"));
    expect(updates).toHaveLength(2);
    const tags0 = (acharOp(updates[0]!.ops!, "update")!.args[0] as { tags: string[] }).tags;
    expect(tags0).toContain("divulgador_convidado");
  });

  it("pula número inválido, convida os válidos", async () => {
    montar([lead("a", [], "31999"), lead("b")]);
    const r = await convidarDivulgadores();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.convidados).toBe(1);
      expect(r.pulados).toEqual([{ nome: "Nome a", motivo: "número inválido" }]);
    }
  });

  it("sem canal (session_not_found) e 0 convidados → ok:false 'Nenhum canal'", async () => {
    montar([lead("a")]);
    vi.mocked(openSharedContactConversation).mockRejectedValueOnce(new Error("session_not_found"));
    const r = await convidarDivulgadores();
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("Nenhum canal") } as never);
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("org sempre da sessão (nunca do input) — ctx do envio usa ORG", async () => {
    montar([lead("a")]);
    await convidarDivulgadores();
    const ctx = vi.mocked(sendMessageHandler).mock.calls[0]![1] as { organization_id: string };
    expect(ctx.organization_id).toBe(ORG);
  });
});

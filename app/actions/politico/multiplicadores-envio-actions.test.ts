import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { obterOuCriarShare, urlDoVideoShare } from "@/lib/politico/video-share";
import { makeDb } from "@/tests/fake/fake-supabase";
import {
  listarVideosDaBiblioteca,
  enviarVideoAosMultiplicadores,
} from "./multiplicadores-envio-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/messaging/open-shared-contact-conversation", () => ({ openSharedContactConversation: vi.fn() }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));
vi.mock("@/lib/politico/video-share", () => ({ obterOuCriarShare: vi.fn(), urlDoVideoShare: vi.fn() }));

const ORG = "org-xyz";
type Contato = { id: string; name: string | null; phone_number: string | null };
const FONE = "+5531988887777"; // BR plausível (13 dígitos, DDD 31)

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ id: "u1", idioma: "pt" } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG } as never);
  vi.mocked(urlDoVideoShare).mockImplementation((id: string) => `https://t/vid/${id}`);
  vi.mocked(obterOuCriarShare).mockImplementation(async (_a, e: { contactId: string | null }) => `share-${e.contactId}`);
  vi.mocked(openSharedContactConversation).mockImplementation(
    async (_a, _o, e: { contact_id: string }) => ({ conversation_id: `conv-${e.contact_id}` }) as never,
  );
  vi.mocked(sendMessageHandler).mockResolvedValue(undefined as never);
});

/** db (createClient) com o cohort de contacts; admin (createAdminClient) com pol_materiais. */
function montar(opts: { cohort?: Contato[]; mat?: { id: string } | null; videos?: { id: string; titulo: string | null }[] }) {
  const db = makeDb({
    contacts: () => ({ data: opts.cohort ?? [] }),
    pol_materiais: () => ({ data: opts.videos ?? [] }),
  });
  const admin = makeDb({ pol_materiais: () => ({ data: opts.mat === undefined ? { id: "m1" } : opts.mat }) });
  vi.mocked(createClient).mockResolvedValue(db as never);
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  return { db, admin };
}

describe("listarVideosDaBiblioteca", () => {
  it("mapeia e aplica fallback de título", async () => {
    montar({ videos: [{ id: "v1", titulo: "Reels 1" }, { id: "v2", titulo: null }, { id: "v3", titulo: "   " }] });
    const r = await listarVideosDaBiblioteca();
    expect(r).toEqual([
      { id: "v1", titulo: "Reels 1" },
      { id: "v2", titulo: "Vídeo sem título" },
      { id: "v3", titulo: "Vídeo sem título" },
    ]);
  });

  it("filtra tipo=video e ativo=true (eq aplicados)", async () => {
    const { db } = montar({ videos: [] });
    await listarVideosDaBiblioteca();
    const call = db.__calls.find((c) => c.table === "pol_materiais")!;
    const eqs = call.ops!.filter((o) => o.m === "eq").map((o) => o.args);
    expect(eqs).toEqual(expect.arrayContaining([["tipo", "video"], ["ativo", true], ["organization_id", ORG]]));
  });

  it("sem organização → []", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null as never);
    expect(await listarVideosDaBiblioteca()).toEqual([]);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("enviarVideoAosMultiplicadores — guardas e erros", () => {
  it("sem organização → ok:false, sem tocar banco", async () => {
    vi.mocked(resolveActiveOrg).mockResolvedValue(null as never);
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r).toEqual({ ok: false, erro: "Sessão ou organização inválida." });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("materialId vazio (%j) → 'Escolha um vídeo.'", async (mid) => {
    montar({});
    const r = await enviarVideoAosMultiplicadores(mid);
    expect(r).toEqual({ ok: false, erro: "Escolha um vídeo." });
  });

  it("vídeo de outra org / inexistente → erro", async () => {
    montar({ mat: null });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r).toEqual({ ok: false, erro: "Vídeo não encontrado nesta biblioteca." });
  });

  it("confere o material pela org E id E tipo=video", async () => {
    const { admin } = montar({ mat: { id: "m1" }, cohort: [] });
    await enviarVideoAosMultiplicadores("m1");
    const call = admin.__calls.find((c) => c.table === "pol_materiais")!;
    const eqs = call.ops!.filter((o) => o.m === "eq").map((o) => o.args);
    expect(eqs).toEqual(expect.arrayContaining([["organization_id", ORG], ["id", "m1"], ["tipo", "video"]]));
  });

  it("cohort vazio → erro 'Nenhum multiplicador'", async () => {
    montar({ mat: { id: "m1" }, cohort: [] });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Nenhum multiplicador");
  });
});

describe("enviarVideoAosMultiplicadores — pulos por destinatário", () => {
  it.each([
    ["sem telefone", { id: "c1", name: "Ana", phone_number: null }, "sem telefone"],
    ["telefone vazio", { id: "c1", name: "Ana", phone_number: "   " }, "sem telefone"],
    ["não-BR", { id: "c1", name: "Ana", phone_number: "+15551234567" }, "número inválido"],
    ["DDD inválido", { id: "c1", name: "Ana", phone_number: "+5500999998888" }, "número inválido"],
    ["curto demais", { id: "c1", name: "Ana", phone_number: "+5531999" }, "número inválido"],
  ])("%s → pulado com motivo '%s'", async (_nome, contato, motivo) => {
    montar({ mat: { id: "m1" }, cohort: [contato as Contato] });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.enviados).toBe(0);
      expect(r.pulados).toEqual([{ nome: "Ana", motivo }]);
    }
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("openSharedContactConversation lança 'contact_personal' → pulado 'contato pessoal'", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(openSharedContactConversation).mockRejectedValue(new Error("contact_personal"));
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pulados).toEqual([{ nome: "Ana", motivo: "contato pessoal" }]);
  });

  it("erro genérico ao abrir conversa → pulado 'não abriu a conversa'", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(openSharedContactConversation).mockRejectedValue(new Error("qualquer outra"));
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) expect(r.pulados).toEqual([{ nome: "Ana", motivo: "não abriu a conversa" }]);
  });

  it("obterOuCriarShare → null → pulado 'falha ao gerar o link'", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(obterOuCriarShare).mockResolvedValue(null);
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) expect(r.pulados).toEqual([{ nome: "Ana", motivo: "falha ao gerar o link" }]);
  });

  it("sendMessageHandler lança → pulado com o motivo (truncado 60)", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(sendMessageHandler).mockRejectedValue(new Error("rejeitado pelo WAHA"));
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) {
      expect(r.enviados).toBe(0);
      expect(r.pulados[0]!.motivo).toBe("rejeitado pelo WAHA");
    }
  });
});

describe("enviarVideoAosMultiplicadores — sem canal (session_not_found)", () => {
  it("todos sem canal e nenhum enviado → ok:false 'Nenhum canal'", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(openSharedContactConversation).mockRejectedValue(new Error("session_not_found"));
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Nenhum canal");
  });

  it("session_not_found DEPOIS de já ter enviado → ok:true (break, mantém enviados)", async () => {
    montar({
      mat: { id: "m1" },
      cohort: [
        { id: "c1", name: "Ana", phone_number: FONE },
        { id: "c2", name: "Bia", phone_number: FONE },
      ],
    });
    vi.mocked(openSharedContactConversation).mockImplementation(async (_a, _o, e: { contact_id: string }) => {
      if (e.contact_id === "c2") throw new Error("session_not_found");
      return { conversation_id: `conv-${e.contact_id}` } as never;
    });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.enviados).toBe(1);
      expect(r.total).toBe(2);
    }
  });
});

describe("enviarVideoAosMultiplicadores — CAMINHO FELIZ", () => {
  it("envia com link pessoal + primeiro nome; type text; conversation certo; org da sessão", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana Paula Souza", phone_number: FONE }] });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r).toEqual({ ok: true, total: 1, enviados: 1, pulados: [] });

    expect(sendMessageHandler).toHaveBeenCalledTimes(1);
    const [, ctx, payload] = vi.mocked(sendMessageHandler).mock.calls[0]!;
    expect((ctx as { organization_id: string }).organization_id).toBe(ORG); // org SEMPRE da sessão
    expect((payload as { type: string }).type).toBe("text");
    expect((payload as { conversation_id: string }).conversation_id).toBe("conv-c1");
    const body = (payload as { body: string }).body;
    expect(body).toContain("https://t/vid/share-c1"); // url do link PESSOAL dele
    expect(body).toContain("Ana"); // primeiro nome
    expect(body).not.toContain("Paula"); // só o primeiro nome
  });

  it("obterOuCriarShare é chamado com o contato e o material certos", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "cX", name: "Zé", phone_number: FONE }] });
    await enviarVideoAosMultiplicadores("m1");
    expect(obterOuCriarShare).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG,
      materialId: "m1",
      contactId: "cX",
    });
  });

  it("nome string vazia → saudação 'Olá!' (sem nome)", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "", phone_number: FONE }] });
    await enviarVideoAosMultiplicadores("m1");
    const body = (vi.mocked(sendMessageHandler).mock.calls[0]![2] as { body: string }).body;
    expect(body.startsWith("Olá! 👋")).toBe(true);
  });

  it("nome NULL → saudação 'Olá!' (não usa o fallback 'Sem nome' na saudação)", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: null, phone_number: FONE }] });
    await enviarVideoAosMultiplicadores("m1");
    const body = (vi.mocked(sendMessageHandler).mock.calls[0]![2] as { body: string }).body;
    expect(body.startsWith("Olá! 👋")).toBe(true);
    expect(body).not.toContain("Sem!");
  });

  it.each([2, 3, 5])("envia pra %i multiplicadores válidos (sequencial)", async (n) => {
    const cohort = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Pessoa ${i}`, phone_number: FONE }));
    montar({ mat: { id: "m1" }, cohort });
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) {
      expect(r.enviados).toBe(n);
      expect(r.total).toBe(n);
      expect(r.pulados).toEqual([]);
    }
    expect(sendMessageHandler).toHaveBeenCalledTimes(n);
  });
});

describe("enviarVideoAosMultiplicadores — MISTURA (válidos + pulados)", () => {
  it("conta certo enviados/total/pulados numa leva variada", async () => {
    montar({
      mat: { id: "m1" },
      cohort: [
        { id: "ok1", name: "Ana", phone_number: FONE },
        { id: "np", name: "Bruno", phone_number: null }, // sem telefone
        { id: "inv", name: "Carla", phone_number: "+15550001111" }, // não-BR
        { id: "ok2", name: "Davi", phone_number: FONE },
      ],
    });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.total).toBe(4);
      expect(r.enviados).toBe(2);
      expect(r.pulados).toEqual([
        { nome: "Bruno", motivo: "sem telefone" },
        { nome: "Carla", motivo: "número inválido" },
      ]);
    }
    expect(sendMessageHandler).toHaveBeenCalledTimes(2);
  });
});

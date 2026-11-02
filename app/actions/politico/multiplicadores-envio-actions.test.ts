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
const url = (contactId: string) => `https://t/vid/share-${contactId}`;

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

/** Atalho: payload (3º arg) da n-ésima chamada do sendMessageHandler. */
function payloadDe(i: number): { conversation_id: string; type: string; body: string } {
  return vi.mocked(sendMessageHandler).mock.calls[i]![2] as never;
}
function ctxDe(i: number): { organization_id: string } {
  return vi.mocked(sendMessageHandler).mock.calls[i]![1] as never;
}

describe("listarVideosDaBiblioteca", () => {
  it("mapeia e aplica fallback 'Conteúdo sem título'", async () => {
    montar({ videos: [{ id: "v1", titulo: "Reels 1" }, { id: "v2", titulo: null }, { id: "v3", titulo: "   " }] });
    const r = await listarVideosDaBiblioteca();
    expect(r).toEqual([
      { id: "v1", titulo: "Reels 1" },
      { id: "v2", titulo: "Conteúdo sem título" },
      { id: "v3", titulo: "Conteúdo sem título" },
    ]);
  });

  it("filtra por URL do Instagram (ilike) + ativo + org (NÃO por tipo)", async () => {
    const { db } = montar({ videos: [] });
    await listarVideosDaBiblioteca();
    const call = db.__calls.find((c) => c.table === "pol_materiais")!;
    const eqs = call.ops!.filter((o) => o.m === "eq").map((o) => o.args);
    expect(eqs).toEqual(expect.arrayContaining([["ativo", true], ["organization_id", ORG]]));
    expect(eqs.some((a) => a[0] === "tipo")).toBe(false); // tipo NÃO é mais filtro
    expect(call.ops!.some((o) => o.m === "ilike" && o.args[0] === "url" && o.args[1] === "%instagram.com%")).toBe(true);
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
    expect(await enviarVideoAosMultiplicadores(mid)).toEqual({ ok: false, erro: "Escolha um vídeo." });
  });

  it("conteúdo não é do Instagram / inexistente → erro novo", async () => {
    montar({ mat: null });
    expect(await enviarVideoAosMultiplicadores("m1")).toEqual({
      ok: false,
      erro: "Conteúdo do Instagram não encontrado nesta biblioteca.",
    });
  });

  it("valida o conteúdo por org + id + URL do Instagram (ilike)", async () => {
    const { admin } = montar({ mat: { id: "m1" }, cohort: [] });
    await enviarVideoAosMultiplicadores("m1");
    const call = admin.__calls.find((c) => c.table === "pol_materiais")!;
    const eqs = call.ops!.filter((o) => o.m === "eq").map((o) => o.args);
    expect(eqs).toEqual(expect.arrayContaining([["organization_id", ORG], ["id", "m1"]]));
    expect(call.ops!.some((o) => o.m === "ilike" && o.args[0] === "url" && o.args[1] === "%instagram.com%")).toBe(true);
  });

  it("cohort vazio → erro 'Nenhum multiplicador'", async () => {
    montar({ mat: { id: "m1" }, cohort: [] });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Nenhum multiplicador");
  });
});

describe("enviarVideoAosMultiplicadores — pulos por destinatário (nenhuma mensagem)", () => {
  it.each([
    ["sem telefone", { id: "c1", name: "Ana", phone_number: null }, "sem telefone"],
    ["telefone vazio", { id: "c1", name: "Ana", phone_number: "   " }, "sem telefone"],
    ["não-BR", { id: "c1", name: "Ana", phone_number: "+15551234567" }, "número inválido"],
    ["DDD inválido", { id: "c1", name: "Ana", phone_number: "+5500999998888" }, "número inválido"],
    ["curto demais", { id: "c1", name: "Ana", phone_number: "+5531999" }, "número inválido"],
  ])("%s → pulado '%s', zero mensagens", async (_n, contato, motivo) => {
    montar({ mat: { id: "m1" }, cohort: [contato as Contato] });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.enviados).toBe(0);
      expect(r.pulados).toEqual([{ nome: "Ana", motivo }]);
    }
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("contact_personal → pulado 'contato pessoal'", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(openSharedContactConversation).mockRejectedValue(new Error("contact_personal"));
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) expect(r.pulados).toEqual([{ nome: "Ana", motivo: "contato pessoal" }]);
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("erro genérico ao abrir conversa → 'não abriu a conversa'", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(openSharedContactConversation).mockRejectedValue(new Error("qualquer outra"));
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) expect(r.pulados).toEqual([{ nome: "Ana", motivo: "não abriu a conversa" }]);
  });

  it("obterOuCriarShare → null → 'falha ao gerar o link'", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(obterOuCriarShare).mockResolvedValue(null);
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) expect(r.pulados).toEqual([{ nome: "Ana", motivo: "falha ao gerar o link" }]);
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });
});

describe("enviarVideoAosMultiplicadores — handler lança (na 1ª OU na 2ª mensagem)", () => {
  it("lança na 1ª (instrução) → pulado, enviados 0", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(sendMessageHandler).mockImplementation(async (_d, _c, p: { body: string }) => {
      if (p.body.includes("multiplicar")) throw new Error("falhou na instrução");
      return undefined as never;
    });
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) {
      expect(r.enviados).toBe(0);
      expect(r.pulados[0]!.motivo).toBe("falhou na instrução");
    }
  });

  it("lança na 2ª (o link) → pulado, enviados 0 (as duas no mesmo try)", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(sendMessageHandler).mockImplementation(async (_d, _c, p: { body: string }) => {
      if (p.body.startsWith("https://")) throw new Error("falhou no link");
      return undefined as never;
    });
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) {
      expect(r.enviados).toBe(0);
      expect(r.pulados[0]!.motivo).toBe("falhou no link");
    }
  });
});

describe("enviarVideoAosMultiplicadores — sem canal (session_not_found)", () => {
  it("todos sem canal, 0 enviados → ok:false 'Nenhum canal'", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana", phone_number: FONE }] });
    vi.mocked(openSharedContactConversation).mockRejectedValue(new Error("session_not_found"));
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Nenhum canal");
  });

  it("session_not_found DEPOIS de enviado → ok:true (break, mantém enviados)", async () => {
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
    expect(sendMessageHandler).toHaveBeenCalledTimes(2); // 2 mensagens do c1 (c2 nem chegou a enviar)
  });
});

describe("enviarVideoAosMultiplicadores — CAMINHO FELIZ (DUAS mensagens)", () => {
  it("1ª = instrução (com 1º nome, SEM url); 2ª = SÓ o link (url exata)", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name: "Ana Paula Souza", phone_number: FONE }] });
    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r).toEqual({ ok: true, total: 1, enviados: 1, pulados: [] });
    expect(sendMessageHandler).toHaveBeenCalledTimes(2); // 2 por contato enviado

    // 1ª: instrução
    const m1 = payloadDe(0);
    expect(m1.type).toBe("text");
    expect(m1.conversation_id).toBe("conv-c1");
    expect(m1.body).toContain("Ana"); // 1º nome
    expect(m1.body).not.toContain("Paula"); // só o 1º nome
    expect(m1.body).not.toContain(url("c1")); // a instrução NÃO tem o link
    expect(m1.body).toContain("encaminhar a mensagem abaixo");

    // 2ª: SÓ o link
    const m2 = payloadDe(1);
    expect(m2.type).toBe("text");
    expect(m2.conversation_id).toBe("conv-c1");
    expect(m2.body).toBe(url("c1")); // exatamente a url, nada mais

    // org SEMPRE da sessão, nas duas
    expect(ctxDe(0).organization_id).toBe(ORG);
    expect(ctxDe(1).organization_id).toBe(ORG);
  });

  it("a 2ª mensagem é SÓ o link (sem nenhuma instrução)", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "cZ", name: "Zé", phone_number: FONE }] });
    await enviarVideoAosMultiplicadores("m1");
    const link = payloadDe(1).body;
    expect(link).toBe(url("cZ"));
    expect(link).not.toContain("Olá");
    expect(link).not.toContain("multiplicar");
    expect(link.split("\n")).toHaveLength(1); // uma linha só = o link puro
  });

  it("obterOuCriarShare chamado com {org, materialId, contactId}", async () => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "cX", name: "Zé", phone_number: FONE }] });
    await enviarVideoAosMultiplicadores("m1");
    expect(obterOuCriarShare).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG,
      materialId: "m1",
      contactId: "cX",
    });
  });

  it.each([
    [null, "Olá! 👋"], // nome null → saudação sem nome (não mais 'Olá, Sem!')
    ["", "Olá! 👋"], // nome vazio → idem
    ["Bruno", "Olá, Bruno!"], // com nome
  ])("saudação para name=%j → começa com %j", async (name, inicio) => {
    montar({ mat: { id: "m1" }, cohort: [{ id: "c1", name, phone_number: FONE }] });
    await enviarVideoAosMultiplicadores("m1");
    expect(payloadDe(0).body.startsWith(inicio as string)).toBe(true);
  });

  it.each([2, 3, 5])("%i válidos → %i enviados e 2×%i chamadas", async (n) => {
    const cohort = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Pessoa ${i}`, phone_number: FONE }));
    montar({ mat: { id: "m1" }, cohort });
    const r = await enviarVideoAosMultiplicadores("m1");
    if (r.ok) {
      expect(r.enviados).toBe(n);
      expect(r.total).toBe(n);
      expect(r.pulados).toEqual([]);
    }
    expect(sendMessageHandler).toHaveBeenCalledTimes(2 * n);
  });
});

describe("enviarVideoAosMultiplicadores — MISTURA (válidos + pulados)", () => {
  it("2 válidos + 2 pulados → total 4, enviados 2, 4 chamadas", async () => {
    montar({
      mat: { id: "m1" },
      cohort: [
        { id: "ok1", name: "Ana", phone_number: FONE },
        { id: "np", name: "Bruno", phone_number: null },
        { id: "inv", name: "Carla", phone_number: "+15550001111" },
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
    expect(sendMessageHandler).toHaveBeenCalledTimes(4); // 2 válidos × 2 mensagens
  });
});

describe("enviarVideoAosMultiplicadores — ESCALA (20 disparos)", () => {
  it("20 multiplicadores válidos → 20 enviados, 40 mensagens (instrução→link por contato)", async () => {
    const cohort: Contato[] = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      name: `Nome${i} Sobrenome${i}`,
      phone_number: FONE,
    }));
    montar({ mat: { id: "m1" }, cohort });

    const r = await enviarVideoAosMultiplicadores("m1");
    expect(r).toEqual({ ok: true, total: 20, enviados: 20, pulados: [] });

    // 2 mensagens por contato enviado.
    expect(sendMessageHandler).toHaveBeenCalledTimes(40);

    // Ordem sequencial: para cada contato k, calls[2k]=instrução, calls[2k+1]=link.
    for (const k of [0, 1, 7, 13, 19]) {
      const instr = payloadDe(2 * k);
      const link = payloadDe(2 * k + 1);
      expect(instr.conversation_id).toBe(`conv-c${k}`);
      expect(link.conversation_id).toBe(`conv-c${k}`);
      expect(instr.body).toContain(`Nome${k}`); // 1º nome
      expect(instr.body).not.toContain(url(`c${k}`)); // instrução SEM url
      expect(link.body).toBe(url(`c${k}`)); // link = só a url
      expect(ctxDe(2 * k).organization_id).toBe(ORG);
      expect(ctxDe(2 * k + 1).organization_id).toBe(ORG);
    }

    // Exatamente 20 mensagens cujo body É uma url de link pessoal.
    const bodies = vi.mocked(sendMessageHandler).mock.calls.map((c) => (c[2] as { body: string }).body);
    const links = bodies.filter((b) => /^https:\/\/t\/vid\/share-c\d+$/.test(b));
    expect(links).toHaveLength(20);
    expect(new Set(links).size).toBe(20); // todos distintos (link pessoal de cada um)

    // obterOuCriarShare: 1x por contato, com {org, materialId, contactId}.
    expect(obterOuCriarShare).toHaveBeenCalledTimes(20);
    for (let i = 0; i < 20; i++) {
      expect(obterOuCriarShare).toHaveBeenNthCalledWith(i + 1, expect.anything(), {
        organizationId: ORG,
        materialId: "m1",
        contactId: `c${i}`,
      });
    }
  });
});

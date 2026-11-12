import { afterEach, describe, expect, it, vi } from "vitest";

import { inscreverContaNosAvisos, lerInscricaoDaConta } from "./inscricao";

const CREDS = { token: "tok", graphVersion: "v21.0" };
const responde = (status: number, corpo: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("inscreverContaNosAvisos", () => {
  it("faz POST em /me/subscribed_apps no host do Instagram, com comments e messages e o token no cabeçalho", async () => {
    const f = responde(200, { success: true });
    vi.stubGlobal("fetch", f);
    const r = await inscreverContaNosAvisos(CREDS);
    expect(r).toEqual({ ok: true, campos: ["comments", "messages"] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=comments%2Cmessages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(url).not.toContain("tok"); // token nunca na URL
  });

  it("recusa da Meta volta como erro, com a mensagem dela e o status", async () => {
    vi.stubGlobal("fetch", responde(400, { error: { message: "app não publicado" } }));
    expect(await inscreverContaNosAvisos(CREDS)).toEqual({ ok: false, erro: "app não publicado", httpStatus: 400 });
  });

  it("falha de rede não lança: devolve erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem rede"); }));
    expect(await inscreverContaNosAvisos(CREDS)).toEqual({ ok: false, erro: "sem rede" });
  });
});

describe("lerInscricaoDaConta", () => {
  it("devolve os campos em que a conta está inscrita", async () => {
    vi.stubGlobal("fetch", responde(200, { data: [{ id: "1", subscribed_fields: ["comments", "messages"] }] }));
    expect(await lerInscricaoDaConta(CREDS)).toEqual({ ok: true, campos: ["comments", "messages"] });
  });

  it("conta não inscrita: lista vazia (não é erro)", async () => {
    vi.stubGlobal("fetch", responde(200, { data: [] }));
    expect(await lerInscricaoDaConta(CREDS)).toEqual({ ok: true, campos: [] });
  });

  it("resposta fora do formato não derruba", async () => {
    vi.stubGlobal("fetch", responde(200, { data: [null, { subscribed_fields: "x" }, { subscribed_fields: [1, "comments"] }] }));
    expect(await lerInscricaoDaConta(CREDS)).toEqual({ ok: true, campos: ["comments"] });
  });

  it("erro da Meta volta como erro", async () => {
    vi.stubGlobal("fetch", responde(401, { error: { message: "token inválido" } }));
    expect(await lerInscricaoDaConta(CREDS)).toEqual({ ok: false, erro: "token inválido", httpStatus: 401 });
  });
});

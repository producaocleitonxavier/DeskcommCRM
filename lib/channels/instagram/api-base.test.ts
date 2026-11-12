import { afterEach, describe, expect, it, vi } from "vitest";

import { ehLoginDoInstagram, igApiBase, igRemetenteId } from "./api-base";
import type { IgCredentials } from "./credentials";
import { responderComentarioInstagram } from "./reply-comment";
import { enviarDmInstagram } from "./send-dm";

const LOGIN_IG: IgCredentials = { businessAccountId: "17840000000000001", pageId: null, token: "tok", graphVersion: "v21.0", source: "session" };
const COM_PAGINA: IgCredentials = { businessAccountId: "17840000000000001", pageId: "100200300", token: "tok", graphVersion: "v21.0", source: "env" };

function fetchQueResponde(status: number, corpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api-base — qual API do Instagram a conexão fala", () => {
  it("sem Página = login do Instagram: host do Instagram e a própria conta como remetente", () => {
    expect(ehLoginDoInstagram(LOGIN_IG)).toBe(true);
    expect(igApiBase(LOGIN_IG)).toBe("https://graph.instagram.com/v21.0");
    expect(igRemetenteId(LOGIN_IG)).toBe("17840000000000001");
  });

  it("com Página = login do Facebook: Graph do Facebook e a Página como remetente", () => {
    expect(ehLoginDoInstagram(COM_PAGINA)).toBe(false);
    expect(igApiBase(COM_PAGINA)).toMatch(/^https:\/\/graph\.facebook\.com\/v21\.0$/);
    expect(igRemetenteId(COM_PAGINA)).toBe("100200300");
  });
});

describe("enviarDmInstagram — a DM sai nos dois tipos de conexão", () => {
  it("login do Instagram (sem Página): NÃO recusa mais; envia por /{ig_id}/messages no host do Instagram", async () => {
    const f = fetchQueResponde(200, { message_id: "m1" });
    vi.stubGlobal("fetch", f);
    const r = await enviarDmInstagram(LOGIN_IG, { recipientId: "999", text: "Olá" });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.instagram.com/v21.0/17840000000000001/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual({ recipient: { id: "999" }, message: { text: "Olá" } });
  });

  it("login do Facebook (com Página): segue enviando pela Página, na Graph do Facebook", async () => {
    const f = fetchQueResponde(200, { message_id: "m2" });
    vi.stubGlobal("fetch", f);
    const r = await enviarDmInstagram(COM_PAGINA, { recipientId: "999", text: "Olá" });
    expect(r.ok).toBe(true);
    const [url] = f.mock.calls[0] as unknown as [string];
    expect(url).toMatch(/^https:\/\/graph\.facebook\.com\/v21\.0\/100200300\/messages$/);
  });

  it("quem só comentou: a primeira DM vai como resposta privada (recipient.comment_id), não pelo IGSID", async () => {
    const f = fetchQueResponde(200, { message_id: "m3" });
    vi.stubGlobal("fetch", f);
    const r = await enviarDmInstagram(LOGIN_IG, { recipientId: "999", commentId: "178900001", text: "Olá" });
    expect(r.ok).toBe(true);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ recipient: { comment_id: "178900001" }, message: { text: "Olá" } });
  });

  it("controle: sem comentário de origem segue pelo IGSID (conversa já aberta)", async () => {
    const f = fetchQueResponde(200, { message_id: "m4" });
    vi.stubGlobal("fetch", f);
    await enviarDmInstagram(LOGIN_IG, { recipientId: "999", text: "Olá" });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).recipient).toEqual({ id: "999" });
  });

  it("controle negativo: sem texto nem anexo não chama a rede", async () => {
    const f = fetchQueResponde(200, {});
    vi.stubGlobal("fetch", f);
    const r = await enviarDmInstagram(LOGIN_IG, { recipientId: "999" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ig_dm_sem_conteudo");
    expect(f).not.toHaveBeenCalled();
  });

  it("controle negativo: credencial sem Página E sem id da conta recusa sem chamar a rede", async () => {
    const f = fetchQueResponde(200, {});
    vi.stubGlobal("fetch", f);
    const r = await enviarDmInstagram({ ...LOGIN_IG, businessAccountId: "" }, { recipientId: "999", text: "Olá" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ig_remetente_ausente");
    expect(f).not.toHaveBeenCalled();
  });

  it("erro da Meta volta como falha, com o status (não finge sucesso)", async () => {
    vi.stubGlobal("fetch", fetchQueResponde(400, { error: { message: "fora da janela de 24h" } }));
    const r = await enviarDmInstagram(LOGIN_IG, { recipientId: "999", text: "Olá" });
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(400);
  });
});

describe("responderComentarioInstagram — mesmo host da conexão", () => {
  it("login do Instagram: responde em graph.instagram.com", async () => {
    const f = fetchQueResponde(200, { id: "c1" });
    vi.stubGlobal("fetch", f);
    await responderComentarioInstagram(LOGIN_IG, { instagramCommentId: "555", text: "Obrigado!" });
    const [url] = f.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://graph.instagram.com/v21.0/555/replies");
  });

  it("login do Facebook: responde na Graph do Facebook", async () => {
    const f = fetchQueResponde(200, { id: "c2" });
    vi.stubGlobal("fetch", f);
    await responderComentarioInstagram(COM_PAGINA, { instagramCommentId: "555", text: "Obrigado!" });
    const [url] = f.mock.calls[0] as unknown as [string];
    expect(url).toMatch(/^https:\/\/graph\.facebook\.com\/v21\.0\/555\/replies$/);
  });
});

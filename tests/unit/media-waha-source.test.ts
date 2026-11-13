import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchWahaMedia } from "@/lib/messaging/media/waha-source";
import { MediaTooLargeError } from "@/lib/messaging/media/types";

const WAHA_BASE = "http://localhost:3030";

describe("fetchWahaMedia", () => {
  beforeEach(() => {
    vi.stubEnv("WAHA_API_BASE_URL", WAHA_BASE);
    vi.stubEnv("WAHA_API_KEY", "hash123");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("baixa a mídia com X-Api-Key e retorna buffer + mime", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const media = await fetchWahaMedia(`${WAHA_BASE}/api/files/abc.jpg`);
    expect(media.mime).toBe("image/jpeg");
    expect(media.buffer.byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/abc.jpg`,
      expect.objectContaining({ headers: { "X-Api-Key": "hash123" } }),
    );
  });

  it("reescreve host arbitrário p/ a base do WAHA (anti-SSRF por construção)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new ArrayBuffer(2), { status: 200, headers: { "content-type": "image/jpeg" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchWahaMedia("http://evil.example.com/api/files/x.jpg?q=1");
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/x.jpg?q=1`,
      expect.anything(),
    );
  });

  it("reescreve a porta interna anunciada pelo WAHA p/ a base real", async () => {
    // WAHA anuncia localhost:3000 (porta interna do container); no host é 3030.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new ArrayBuffer(2), { status: 200, headers: { "content-type": "image/webp" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchWahaMedia("http://localhost:3000/api/files/sessao/sticker.webp");
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/sessao/sticker.webp`,
      expect.anything(),
    );
  });

  it("propaga status HTTP de erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(fetchWahaMedia(`${WAHA_BASE}/api/files/gone.jpg`)).rejects.toThrow(
      "waha_media_404",
    );
  });

  it("rejeita mídia acima de 50MB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new ArrayBuffer(8), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": String(60 * 1024 * 1024) },
        }),
      ),
    );
    await expect(fetchWahaMedia(`${WAHA_BASE}/api/files/big.mp4`)).rejects.toThrow(
      MediaTooLargeError,
    );
  });

  it("usa hintMime quando o content-type vem vazio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new ArrayBuffer(2), { status: 200 })),
    );
    const media = await fetchWahaMedia(`${WAHA_BASE}/api/files/x`, "audio/ogg; codecs=opus");
    expect(media.mime).toBe("audio/ogg; codecs=opus");
  });

  it("mapeia mediaUrl malformada p/ waha_media_untrusted_host", async () => {
    await expect(fetchWahaMedia("not-a-url")).rejects.toThrow("waha_media_untrusted_host");
  });

  // ── auditoria de 13/nov/2026 ────────────────────────────────────────────────
  it("caminho começando com // NÃO troca o host nem leva a chave para fora", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWahaMedia("https://publico.example//evil.test/api/files/x.jpg")).rejects.toThrow("waha_media_untrusted_host");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("só arquivo de mídia: outro caminho da API do gateway é recusado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const url of [
      "https://publico.example/api/sessions?all=true",
      "https://publico.example/api/default/chats",
      "https://publico.example/api/files/../sessions",
      "https://publico.example/",
    ]) {
      await expect(fetchWahaMedia(url), url).rejects.toThrow("waha_media_untrusted_host");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("controle: arquivo de mídia legítimo segue indo para a base, sem seguir redirecionamento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(1), { status: 200, headers: { "content-type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchWahaMedia("http://qualquer.host/api/files/sessao/foto.png?x=1");
    expect(fetchMock).toHaveBeenCalledWith(
      `${WAHA_BASE}/api/files/sessao/foto.png?x=1`,
      expect.objectContaining({ redirect: "error" }),
    );
  });
});

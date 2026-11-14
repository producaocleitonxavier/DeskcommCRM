import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { converterParaOPdf, mimeQueOPdfDesenha, pdfDesenhaDireto } from "./imagem-para-pdf";

describe("imagens da identidade para o PDF", () => {
  it("só PNG e JPG vão direto", () => {
    expect(pdfDesenhaDireto("org/timbrado.png")).toBe(true);
    expect(pdfDesenhaDireto("org/timbrado.JPG")).toBe(true);
    expect(pdfDesenhaDireto("org/timbrado.jpeg")).toBe(true);
    expect(pdfDesenhaDireto("org/timbrado.webp")).toBe(false);
    expect(mimeQueOPdfDesenha("image/png")).toBe(true);
    expect(mimeQueOPdfDesenha("image/jpeg")).toBe(true);
    expect(mimeQueOPdfDesenha("image/webp")).toBe(false);
  });

  it("timbrado em WebP vira JPG do mesmo tamanho, sobre branco", async () => {
    const webp = await sharp({ create: { width: 60, height: 85, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).webp().toBuffer();
    const r = await converterParaOPdf(webp, "timbrado");
    expect(r.mime).toBe("image/jpeg");
    expect(r.ext).toBe("jpg");
    const meta = await sharp(r.buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 60, 85]);
    const { data } = await sharp(r.buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240); // transparente virou branco, não preto
  });

  it("logo em WebP vira PNG e mantém a transparência", async () => {
    const webp = await sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).webp({ lossless: true }).toBuffer();
    const r = await converterParaOPdf(webp, "transparente");
    expect(r.mime).toBe("image/png");
    const meta = await sharp(r.buffer).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
  });
});

/**
 * Imagens da identidade do gabinete (timbrado, logo, assinatura) prontas para o PDF.
 *
 * O gerador de PDF só desenha PNG e JPG. Uma imagem em WebP é simplesmente
 * ignorada ("Not valid image extension") e o documento sai SEM o papel timbrado,
 * sem erro na tela. Aqui a imagem em outro formato é convertida:
 *  - no envio (`converterParaOPdf`), para já ficar guardada no formato certo;
 *  - na hora de gerar (`imagemProntaParaPdf`), para as que já estavam guardadas.
 */
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

/** O gerador de PDF desenha este arquivo do jeito que está? (pela extensão do caminho) */
export function pdfDesenhaDireto(caminho: string): boolean {
  return /\.(png|jpe?g)$/i.test(caminho);
}

/** O gerador de PDF desenha este tipo de imagem? (pelo tipo declarado no envio) */
export function mimeQueOPdfDesenha(mime: string): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg";
}

/**
 * Converte para um formato que o PDF desenha. Papel timbrado vira JPG sobre fundo
 * branco (é a página inteira: PNG ficaria pesado demais); logo e assinatura viram
 * PNG, para manter a transparência.
 */
export async function converterParaOPdf(
  original: Buffer,
  uso: "timbrado" | "transparente",
): Promise<{ buffer: Buffer; mime: "image/jpeg" | "image/png"; ext: "jpg" | "png" }> {
  if (uso === "timbrado") {
    const buffer = await sharp(original).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
    return { buffer, mime: "image/jpeg", ext: "jpg" };
  }
  const buffer = await sharp(original).png().toBuffer();
  return { buffer, mime: "image/png", ext: "png" };
}

/**
 * O endereço da imagem para pôr no PDF: link assinado quando o arquivo já é PNG/JPG;
 * senão baixa, converte e devolve embutida (`data:`). `null` se não der — o
 * documento sai sem a imagem, como sempre saiu, em vez de falhar.
 *
 * `caminho` JÁ deve ter sido conferido como da organização por quem chama.
 */
export async function imagemProntaParaPdf(
  admin: SupabaseClient,
  bucket: string,
  caminho: string,
  uso: "timbrado" | "transparente",
): Promise<string | null> {
  try {
    if (pdfDesenhaDireto(caminho)) {
      const { data } = await admin.storage.from(bucket).createSignedUrl(caminho, 60 * 60);
      return data?.signedUrl ?? null;
    }
    const { data: arquivo, error } = await admin.storage.from(bucket).download(caminho);
    if (error || !arquivo) return null;
    const convertida = await converterParaOPdf(Buffer.from(await arquivo.arrayBuffer()), uso);
    return `data:${convertida.mime};base64,${convertida.buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

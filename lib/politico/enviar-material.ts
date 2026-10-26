/**
 * ENVIO DE MATERIAL COMO DOCUMENTO (anexo com NOME) — o jeito padrão.
 *
 * Regra do cliente: material sempre chega como ANEXO com o nome do arquivo
 * ("Os Apps dos Predadores.pdf"), NUNCA como link (link gera desconfiança de
 * vírus). Esta é a peça compartilhada que faz esse envio — usada pela entrega
 * reply-gated do disparo (`entregar-material.ts`) e pela captação por QR
 * (`qr-cadastro.ts`). NÃO faz idempotência nem decide SE deve enviar: isso é do
 * chamador. Só monta o nome do arquivo, resolve o canal e manda o documento.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";

export interface MaterialParaEnvio {
  titulo: string | null;
  url: string;
}

/** mime do anexo a partir da extensão da URL (o WAHA infere o resto). */
export function mimeDoArquivo(url: string): string | undefined {
  const limpo = url.split("?")[0]?.toLowerCase() ?? "";
  if (limpo.endsWith(".pdf")) return "application/pdf";
  if (limpo.endsWith(".doc") || limpo.endsWith(".docx")) return "application/msword";
  if (limpo.endsWith(".epub")) return "application/epub+zip";
  return undefined;
}

/**
 * Nome que o destinatário vê no documento: o TÍTULO do material + a extensão.
 * Sem isto o WhatsApp mostra "file". Sanitiza os caracteres que atrapalham nome
 * de arquivo.
 */
export function nomeDoArquivo(titulo: string | null, url: string): string | undefined {
  const base = (titulo ?? "").trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return undefined;
  const limpo = url.split("?")[0]?.toLowerCase() ?? "";
  const ext = limpo.endsWith(".epub") ? "epub"
    : limpo.endsWith(".docx") ? "docx"
    : limpo.endsWith(".doc") ? "doc"
    : "pdf";
  return `${base}.${ext}`;
}

/**
 * Entrega o material como DOCUMENTO, pelo número `canalId`, com a legenda dada.
 * Retorna `{ enviou }`. Não lança (o chamador é fail-soft); em falha devolve
 * `{ enviou: false, erro }`.
 */
export async function enviarMaterialComoDocumento(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    contactId: string;
    canalId: string;
    material: MaterialParaEnvio;
    legenda: string;
    /** Rótulo da origem no actor/requestId (ex.: "ebook-resposta:<id>" ou "qr:<id>"). */
    rotulo: string;
  },
): Promise<{ enviou: boolean; erro?: string }> {
  try {
    const boundary = await beginServiceAtOrigin(admin, entrada.organizationId, entrada.contactId, entrada.canalId);
    const ctx = {
      organization_id: entrada.organizationId,
      serviceBoundary: boundary,
      proactiveContext: { organizationId: entrada.organizationId, contactId: entrada.contactId },
      actor: { type: "webhook_source", id: entrada.rotulo },
      requestId: `${entrada.rotulo}:${randomUUID()}`,
    } as Parameters<typeof sendMessageHandler>[1];

    const msg = await sendMessageHandler(admin, ctx, {
      conversation_id: boundary.conversation_id,
      type: "document",
      media_url: entrada.material.url,
      media_mime: mimeDoArquivo(entrada.material.url),
      media_filename: nomeDoArquivo(entrada.material.titulo, entrada.material.url),
      body: entrada.legenda,
      metadata: { source: entrada.rotulo, contact_id: entrada.contactId },
    } as Parameters<typeof sendMessageHandler>[2]);

    if ((msg as { status?: string }).status === "failed") {
      return { enviou: false, erro: "waha_error" };
    }
    return { enviou: true };
  } catch (err) {
    return { enviou: false, erro: err instanceof Error ? err.message.slice(0, 160) : "desconhecido" };
  }
}

/**
 * Envia uma MENSAGEM DE TEXTO pelo canal (ex.: pedir o nome no cadastro por QR).
 * Mesmo transporte do material, só que `type: "text"`. Não lança.
 */
export async function enviarTextoNoCanal(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; canalId: string; texto: string; rotulo: string },
): Promise<{ enviou: boolean; erro?: string }> {
  try {
    const boundary = await beginServiceAtOrigin(admin, entrada.organizationId, entrada.contactId, entrada.canalId);
    const ctx = {
      organization_id: entrada.organizationId,
      serviceBoundary: boundary,
      proactiveContext: { organizationId: entrada.organizationId, contactId: entrada.contactId },
      actor: { type: "webhook_source", id: entrada.rotulo },
      requestId: `${entrada.rotulo}:${randomUUID()}`,
    } as Parameters<typeof sendMessageHandler>[1];

    const msg = await sendMessageHandler(admin, ctx, {
      conversation_id: boundary.conversation_id,
      type: "text",
      body: entrada.texto,
      metadata: { source: entrada.rotulo, contact_id: entrada.contactId },
    } as Parameters<typeof sendMessageHandler>[2]);

    if ((msg as { status?: string }).status === "failed") return { enviou: false, erro: "waha_error" };
    return { enviou: true };
  } catch (err) {
    return { enviou: false, erro: err instanceof Error ? err.message.slice(0, 160) : "desconhecido" };
  }
}

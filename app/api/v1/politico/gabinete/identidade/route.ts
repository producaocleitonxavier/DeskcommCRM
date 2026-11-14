/**
 * POST /api/v1/politico/gabinete/identidade — upload da LOGO ou da ASSINATURA
 * do gabinete (timbre dos ofícios). Campo `campo` = "logo" | "assinatura",
 * `file` = imagem (multipart). Sobe no bucket privado `gabinete-identidade` em
 * {org}/{campo}.{ext} (upsert) e grava o caminho em pol_gabinete_config.
 *
 * Só imagem (PNG/JPG/WebP) — é timbre. Mesma validação de mime/tamanho do resto
 * do produto, restringindo a `kind === "image"`.
 */

import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { converterParaOPdf, mimeQueOPdfDesenha } from "@/lib/politico/imagem-para-pdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { requireRole } from "@/lib/auth/require-role";

export const dynamic = "force-dynamic";

const BUCKET = "gabinete-identidade";
const MAX_IDENTIDADE_BYTES = 5 * 1024 * 1024; // 5MB — espelha o bucket

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return fail("forbidden", "Organização inválida.", 403, { requestId });
  // Timbre e assinatura do parlamentar: só gestor troca (a tela já exigia; a rota não).
  const authz = await requireRole("manager", { requestId, resource: "pol_gabinete_config" });
  if (!authz.ok) return authz.response;

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 1_048_576) {
    return fail("payload_too_large", "Arquivo muito grande.", 413, { requestId });
  }

  const form = await req.formData().catch(() => null);
  const campo = String(form?.get("campo") ?? "");
  if (campo !== "logo" && campo !== "assinatura" && campo !== "timbrado" && campo !== "moldura_vitoria") {
    return fail("validation_failed", "Campo 'campo' inválido.", 422, { requestId });
  }
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", "Campo 'file' (multipart) obrigatório.", 422, { requestId });
  }

  const mime = file.type || "application/octet-stream";
  const verdict = validateOutboundMedia(mime, file.size);
  if (!verdict.ok) {
    const status = verdict.code === "payload_too_large" ? 413 : verdict.code === "unsupported_media_type" ? 415 : 422;
    return fail(verdict.code, verdict.message, status, { requestId });
  }
  if (verdict.kind !== "image") {
    return fail("unsupported_media_type", "Envie uma imagem (PNG, JPG ou WebP).", 415, { requestId });
  }
  // A moldura PRECISA ser PNG (as janelas das fotos são áreas transparentes).
  if (campo === "moldura_vitoria" && mime !== "image/png") {
    return fail("unsupported_media_type", "A moldura precisa ser um PNG com as janelas (Antes/Depois) transparentes.", 415, { requestId });
  }
  if (file.size > MAX_IDENTIDADE_BYTES) {
    return fail("payload_too_large", "Imagem acima de 5MB.", 413, { requestId });
  }

  let buffer = Buffer.from(await file.arrayBuffer());
  let mimeFinal = mime;
  let ext = extFromMime(mime);
  // Timbrado, logo e assinatura vão para os PDFs, e o PDF só desenha PNG e JPG: uma imagem
  // em WebP é convertida aqui, para não sair documento sem o papel timbrado.
  if (campo !== "moldura_vitoria" && !mimeQueOPdfDesenha(mime)) {
    try {
      const convertida = await converterParaOPdf(buffer, campo === "timbrado" ? "timbrado" : "transparente");
      buffer = Buffer.from(convertida.buffer);
      mimeFinal = convertida.mime;
      ext = convertida.ext;
    } catch {
      return fail("validation_failed", "Não consegui ler esta imagem. Envie em PNG ou JPG.", 422, { requestId });
    }
    if (buffer.length > MAX_IDENTIDADE_BYTES) {
      return fail("payload_too_large", "A imagem ficou acima de 5MB depois de convertida. Envie em JPG.", 413, { requestId });
    }
  }
  const storagePath = `${org.orgId}/${campo}.${ext}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeFinal, upsert: true });
  if (upErr) {
    console.error("[politico.gabinete.identidade] upload failed", upErr.message);
    return fail("internal_error", "Erro ao subir a imagem.", 500, { requestId });
  }

  const coluna =
    campo === "logo" ? "logo_path"
    : campo === "assinatura" ? "assinatura_path"
    : campo === "timbrado" ? "timbrado_path"
    : "moldura_vitoria_path";
  const db = await createClient();
  const { error: upsertErr } = await db.from("pol_gabinete_config").upsert(
    { organization_id: org.orgId, [coluna]: storagePath, updated_at: new Date().toISOString() },
    { onConflict: "organization_id" },
  );
  if (upsertErr) {
    console.error("[politico.gabinete.identidade] upsert failed", upsertErr.message);
    return fail("internal_error", "Erro ao registrar a imagem.", 500, { requestId });
  }

  return ok({ campo, storage_path: storagePath }, { status: 201, requestId });
}

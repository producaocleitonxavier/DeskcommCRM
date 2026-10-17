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
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const BUCKET = "gabinete-identidade";
const MAX_IDENTIDADE_BYTES = 5 * 1024 * 1024; // 5MB — espelha o bucket

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return fail("forbidden", "Organização inválida.", 403, { requestId });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 1_048_576) {
    return fail("payload_too_large", "Arquivo muito grande.", 413, { requestId });
  }

  const form = await req.formData().catch(() => null);
  const campo = String(form?.get("campo") ?? "");
  if (campo !== "logo" && campo !== "assinatura" && campo !== "timbrado") {
    return fail("validation_failed", "Campo 'campo' deve ser 'logo', 'assinatura' ou 'timbrado'.", 422, { requestId });
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
  if (file.size > MAX_IDENTIDADE_BYTES) {
    return fail("payload_too_large", "Imagem acima de 5MB.", 413, { requestId });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${org.orgId}/${campo}.${extFromMime(mime)}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (upErr) {
    console.error("[politico.gabinete.identidade] upload failed", upErr.message);
    return fail("internal_error", "Erro ao subir a imagem.", 500, { requestId });
  }

  const coluna = campo === "logo" ? "logo_path" : campo === "assinatura" ? "assinatura_path" : "timbrado_path";
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

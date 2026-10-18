/**
 * POST /api/v1/politico/liderancas/[id]/foto — upload da FOTO da liderança
 * (avatar). Imagem (multipart) no bucket privado `gabinete-liderancas` em
 * {org}/{liderancaId}.{ext} (upsert); grava o caminho em pol_liderancas.foto_path.
 * Posse pela RLS de pol_liderancas (client de sessão). Download por URL assinada.
 */

import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "gabinete-liderancas";
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id: liderancaId } = await ctx.params;

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return fail("unauthorized", "Sessão inválida.", 401, { requestId });

  // Posse: a liderança precisa pertencer à org do usuário (RLS devolve a linha).
  const { data: lid, error: lidErr } = await db
    .from("pol_liderancas")
    .select("id, organization_id")
    .eq("id", liderancaId)
    .maybeSingle();
  if (lidErr) return fail("internal_error", "Erro ao validar a liderança.", 500, { requestId });
  if (!lid) return fail("not_found", "Liderança não encontrada.", 404, { requestId });
  const orgId = (lid as { organization_id: string }).organization_id;

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 1_048_576) return fail("payload_too_large", "Arquivo muito grande.", 413, { requestId });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("validation_failed", "Campo 'file' (multipart) obrigatório.", 422, { requestId });

  const mime = file.type || "application/octet-stream";
  const verdict = validateOutboundMedia(mime, file.size);
  if (!verdict.ok) {
    const status = verdict.code === "payload_too_large" ? 413 : verdict.code === "unsupported_media_type" ? 415 : 422;
    return fail(verdict.code, verdict.message, status, { requestId });
  }
  if (verdict.kind !== "image") return fail("unsupported_media_type", "Envie uma imagem (PNG, JPG ou WebP).", 415, { requestId });
  if (file.size > MAX_FOTO_BYTES) return fail("payload_too_large", "Imagem acima de 5MB.", 413, { requestId });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${orgId}/${liderancaId}.${extFromMime(mime)}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (upErr) {
    console.error("[politico.liderancas.foto] upload failed", upErr.message);
    return fail("internal_error", "Erro ao subir a foto.", 500, { requestId });
  }

  const { error: updErr } = await db.from("pol_liderancas").update({ foto_path: storagePath }).eq("id", liderancaId).eq("organization_id", orgId);
  if (updErr) return fail("internal_error", "Erro ao registrar a foto.", 500, { requestId });

  return ok({ storage_path: storagePath }, { status: 201, requestId });
}

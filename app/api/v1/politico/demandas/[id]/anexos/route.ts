/**
 * POST /api/v1/politico/demandas/[id]/anexos — upload de ANEXO de demanda
 * (Gabinete). Arquivo/foto que o cidadao ou o assessor anexa (oficio, foto do
 * problema, documento).
 *
 * Por que uma ROTA e nao uma server action: o upload e multipart (File), e o
 * padrao do produto para binarios e a rota com guard de Content-Length antes de
 * bufferizar (ver app/api/v1/conversations/[id]/notes/media/route.ts). A
 * validacao (allowlist de mime + cap 50MB) e a MESMA do resto do produto
 * (validateOutboundMedia), entao um mime aceito aqui e renderizado depois.
 *
 * Posse: a demanda e lida pelo client AUTENTICADO (cookie de sessao) — a RLS de
 * `demandas` restringe a organizacao do usuario. Sem linha => sem acesso (404).
 * O organization_id do anexo vem da demanda, nunca do input. O arquivo sobe no
 * bucket privado 'gabinete-anexos' com caminho {org}/{demanda}/{uuid}.{ext};
 * download so por URL assinada (ver listarAnexosDemanda).
 */

import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "gabinete-anexos";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id: demandaId } = await ctx.params;

  // Autenticacao + posse pela RLS: o client de sessao so enxerga demandas da
  // organizacao do usuario logado. Anonimo (sem cookie) nao ve nenhuma.
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return fail("unauthorized", "Sessao invalida.", 401, { requestId });

  const { data: dem, error: demErr } = await db
    .from("demandas")
    .select("id, organization_id")
    .eq("id", demandaId)
    .maybeSingle();
  if (demErr) return fail("internal_error", "Erro ao validar a demanda.", 500, { requestId });
  if (!dem) return fail("not_found", "Demanda nao encontrada.", 404, { requestId });
  const orgId = (dem as { organization_id: string }).organization_id;

  // Guard de DoS: rejeita pelo Content-Length ANTES de bufferizar o corpo.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 1_048_576) {
    return fail("payload_too_large", "Arquivo acima de 50MB.", 413, { requestId });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", "Campo 'file' (multipart) obrigatorio.", 422, { requestId });
  }

  const mime = file.type || "application/octet-stream";
  const verdict = validateOutboundMedia(mime, file.size);
  if (!verdict.ok) {
    const status = verdict.code === "payload_too_large" ? 413 : verdict.code === "unsupported_media_type" ? 415 : 422;
    return fail(verdict.code, verdict.message, status, { requestId });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${orgId}/${demandaId}/${randomUUID()}.${extFromMime(mime)}`;

  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    console.error("[politico.demandas.anexos] upload failed", upErr.message);
    return fail("internal_error", "Erro ao subir o arquivo.", 500, { requestId });
  }

  // Nome original do arquivo (so o basename; nunca um caminho).
  const nome = (file.name || "arquivo").split(/[\\/]/).pop()!.slice(0, 200);

  const { data: row, error: insErr } = await admin
    .from("pol_demanda_anexos")
    .insert({
      organization_id: orgId,
      demanda_id: demandaId,
      storage_path: storagePath,
      nome_arquivo: nome,
      media_mime: mime,
      media_size_bytes: buffer.length,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();
  if (insErr) {
    // A linha falhou: remove o objeto para nao deixar orfao fora da fila.
    await admin.storage.from(BUCKET).remove([storagePath]);
    console.error("[politico.demandas.anexos] insert failed", insErr.message);
    return fail("internal_error", "Erro ao registrar o anexo.", 500, { requestId });
  }

  return ok(
    { id: (row as { id: string } | null)?.id, nome_arquivo: nome, media_mime: mime, media_size_bytes: buffer.length },
    { status: 201, requestId },
  );
}

/**
 * PATCH  /api/v1/qr-origens/:id — edita a origem (nome, mensagem, material, número, ativo).
 * DELETE /api/v1/qr-origens/:id — apaga a origem (cascade leva os cadastros).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS = "id, nome, codigo, material_id, channel_session_id, mensagem, ativo, created_at";

const editarSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  mensagem: z.string().min(1).max(600).optional(),
  material_id: z.string().uuid().nullable().optional(),
  channel_session_id: z.string().uuid().nullable().optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "qr-origens" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const parsed = editarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const mudanca: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const campo of ["nome", "mensagem", "material_id", "channel_session_id", "ativo"] as const) {
    if (parsed.data[campo] !== undefined) mudanca[campo] = parsed.data[campo];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pol_qr_origens")
    .update(mudanca)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select(COLUNAS)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Origem não encontrada."), 404, { requestId });

  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "qr-origens" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pol_qr_origens")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "pol_qr_origem.deleted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "pol_qr_origem",
    resourceId: id,
    requestId,
  });

  return ok({ id, deleted: true }, { requestId });
}

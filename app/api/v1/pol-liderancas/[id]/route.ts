/**
 * GET|PATCH|DELETE /api/v1/pol-liderancas/[id]
 *
 * Operacoes em uma lideranca politica especifica.
 *
 * GET    — detalhe da lideranca (viewer+)
 * PATCH  — atualizar parcialmente (manager+)
 * DELETE — hard delete (manager+)
 *
 * Seguranca: filtramos organization_id do cookie/JWT — nunca do body.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSupportWrite } from "@/lib/impersonate/support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

// -- Validacao ----------------------------------------------------------------

const TIPOS = [
  "cabo_eleitoral",
  "coordenador_bairro",
  "coordenador_cidade",
  "lider_comunitario",
  "vereador_aliado",
  "presidente_associacao",
  "lider_religioso",
  "lider_sindical",
  "assessor",
  "outro",
] as const;

const NIVEIS_ENGAJAMENTO = ["baixo", "medio", "alto", "critico"] as const;
const STATUS_LIDERANCA = ["ativo", "inativo", "suspenso"] as const;

const atualizarLiderancaSchema = z
  .object({
    nome: z.string().min(1).max(255),
    apelido: z.string().max(255).nullable(),
    cargo: z.string().max(500).nullable(),
    tipo: z.enum(TIPOS),
    whatsapp: z.string().max(20).nullable(),
    aniversario: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    contact_id: z.string().uuid(),
    pol_lead_id: z.string().uuid().nullable(),
    territory_id: z.string().uuid().nullable(),
    cidade: z.string().max(255).nullable(),
    bairro: z.string().max(255).nullable(),
    zona_eleitoral: z.string().max(100).nullable(),
    nivel_engajamento: z.enum(NIVEIS_ENGAJAMENTO),
    status: z.enum(STATUS_LIDERANCA),
    observacoes: z.string().max(5000).nullable(),
    leads_mobilizados: z.number().int().min(0),
    eventos_organizados: z.number().int().min(0),
  })
  .partial();

// -- Helpers ------------------------------------------------------------------

async function buscarLideranca(db: ReturnType<typeof createAdminClient>, id: string, orgId: string) {
  return db
    .from("pol_liderancas")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
}

// -- GET ----------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("viewer", { requestId, resource: "pol_liderancas" });
  if (!authz.ok) return authz.response;

  const db = createAdminClient();
  const { data: lideranca, error } = await buscarLideranca(db, id, authz.org.orgId);

  if (error || !lideranca) {
    return fail("not_found", "Lideranca nao encontrada", 404, { requestId });
  }

  return ok({ pol_lideranca: lideranca }, { headers: { "x-request-id": requestId } });
}

// -- PATCH --------------------------------------------------------------------

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("manager", { requestId, resource: "pol_liderancas" });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const denied = await requireSupportWrite(orgId);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON invalido", 400, { requestId });
  }

  const parsed = atualizarLiderancaSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Dados invalidos", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  if (Object.keys(parsed.data).length === 0) {
    return fail("bad_request", "Nenhum campo para atualizar", 400, { requestId });
  }

  const db = createAdminClient();

  // Verificar existencia + tenant
  const { data: existente, error: errBusca } = await db
    .from("pol_liderancas")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (errBusca || !existente) {
    return fail("not_found", "Lideranca nao encontrada", 404, { requestId });
  }

  const { data: atualizada, error: errUpdate } = await db
    .from("pol_liderancas")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", orgId)
    .select()
    .single();

  if (errUpdate) {
    if (errUpdate.code === "23503") {
      return fail("bad_request", "Referencia invalida (contact_id, territory_id ou pol_lead_id)", 400, {
        requestId,
      });
    }
    return fail("internal_error", "Erro ao atualizar pol_lideranca", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_liderancas.update",
    resource_id: id,
    metadata: { campos_alterados: Object.keys(parsed.data) },
  });

  return ok({ pol_lideranca: atualizada }, { headers: { "x-request-id": requestId } });
}

// -- DELETE -------------------------------------------------------------------

export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("manager", { requestId, resource: "pol_liderancas" });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const denied = await requireSupportWrite(orgId);
  if (denied) return denied;

  const db = createAdminClient();

  const { data: existente, error: errBusca } = await db
    .from("pol_liderancas")
    .select("id, nome")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (errBusca || !existente) {
    return fail("not_found", "Lideranca nao encontrada", 404, { requestId });
  }

  const { error: errDelete } = await db
    .from("pol_liderancas")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (errDelete) {
    return fail("internal_error", "Erro ao deletar pol_lideranca", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_liderancas.delete",
    resource_id: id,
    metadata: { nome: existente.nome },
  });

  return ok({ deleted: true }, { headers: { "x-request-id": requestId } });
}

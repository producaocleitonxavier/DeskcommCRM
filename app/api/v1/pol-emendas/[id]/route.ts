/**
 * GET|PATCH|DELETE /api/v1/pol-emendas/[id]
 *
 * Operacoes em uma emenda parlamentar especifica.
 *
 * GET    — detalhe da emenda (viewer+)
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

const TIPOS_EMENDA = ["individual", "bancada", "comissao", "relator", "pix"] as const;
const ESFERAS = ["municipal", "estadual", "federal"] as const;

const STATUS_EMENDA = [
  "rascunho",
  "indicada",
  "empenhada",
  "liquidada",
  "paga",
  "devolvida",
  "cancelada",
] as const;

const AREAS_TEMATICAS = [
  "saude",
  "educacao",
  "seguranca",
  "assistencia_social",
  "infraestrutura",
  "cultura",
  "esporte",
  "meio_ambiente",
  "agricultura",
  "tecnologia",
  "outro",
] as const;

const VISIBILIDADES = ["publica", "restrita"] as const;

const atualizarEmendaSchema = z
  .object({
    numero: z.string().max(100).nullable(),
    ano: z.number().int().min(2000).max(2100),
    tipo: z.enum(TIPOS_EMENDA),
    esfera: z.enum(ESFERAS),
    valor_indicado_cents: z.number().int().min(0),
    valor_empenhado_cents: z.number().int().min(0),
    valor_liquidado_cents: z.number().int().min(0),
    valor_pago_cents: z.number().int().min(0),
    currency: z.string().length(3),
    municipio: z.string().max(255).nullable(),
    entidade_beneficiada: z.string().max(500).nullable(),
    cnpj_entidade: z.string().max(18).nullable(),
    territory_id: z.string().uuid().nullable(),
    area_tematica: z.enum(AREAS_TEMATICAS),
    descricao: z.string().min(1).max(5000),
    objeto: z.string().max(5000).nullable(),
    status: z.enum(STATUS_EMENDA),
    data_indicacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    data_empenho: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    data_liquidacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    data_pagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    prazo_execucao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    beneficiarios_estimados: z.number().int().min(0).nullable(),
    lideranca_id: z.string().uuid().nullable(),
    visibilidade: z.enum(VISIBILIDADES),
    observacoes: z.string().max(5000).nullable(),
  })
  .partial();

// -- Helpers ------------------------------------------------------------------

async function buscarEmenda(db: ReturnType<typeof createAdminClient>, id: string, orgId: string) {
  return db
    .from("pol_emendas")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
}

// -- GET ----------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("viewer", { requestId, resource: "pol_emendas" });
  if (!authz.ok) return authz.response;

  const db = createAdminClient();
  const { data: emenda, error } = await buscarEmenda(db, id, authz.org.orgId);

  if (error || !emenda) {
    return fail("not_found", "Emenda nao encontrada", 404, { requestId });
  }

  return ok({ pol_emenda: emenda }, { headers: { "x-request-id": requestId } });
}

// -- PATCH --------------------------------------------------------------------

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("manager", { requestId, resource: "pol_emendas" });
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

  const parsed = atualizarEmendaSchema.safeParse(body);
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
    .from("pol_emendas")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (errBusca || !existente) {
    return fail("not_found", "Emenda nao encontrada", 404, { requestId });
  }

  const { data: atualizada, error: errUpdate } = await db
    .from("pol_emendas")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", orgId)
    .select()
    .single();

  if (errUpdate) {
    if (errUpdate.code === "23503") {
      return fail("bad_request", "Referencia invalida (territory_id ou lideranca_id)", 400, {
        requestId,
      });
    }
    return fail("internal_error", "Erro ao atualizar pol_emenda", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_emendas.update",
    resource_id: id,
    metadata: { campos_alterados: Object.keys(parsed.data) },
  });

  return ok({ pol_emenda: atualizada }, { headers: { "x-request-id": requestId } });
}

// -- DELETE -------------------------------------------------------------------

export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("manager", { requestId, resource: "pol_emendas" });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const denied = await requireSupportWrite(orgId);
  if (denied) return denied;

  const db = createAdminClient();

  const { data: existente, error: errBusca } = await db
    .from("pol_emendas")
    .select("id, descricao, numero")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (errBusca || !existente) {
    return fail("not_found", "Emenda nao encontrada", 404, { requestId });
  }

  const { error: errDelete } = await db
    .from("pol_emendas")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (errDelete) {
    return fail("internal_error", "Erro ao deletar pol_emenda", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_emendas.delete",
    resource_id: id,
    metadata: { descricao: existente.descricao?.slice(0, 100), numero: existente.numero },
  });

  return ok({ deleted: true }, { headers: { "x-request-id": requestId } });
}

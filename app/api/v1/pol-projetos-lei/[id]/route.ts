/**
 * GET|PATCH|DELETE /api/v1/pol-projetos-lei/[id]
 *
 * Operacoes em um projeto de lei especifico.
 *
 * GET    — detalhe do projeto de lei (viewer+)
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
  "projeto_de_lei",
  "projeto_de_resolucao",
  "projeto_de_emenda",
  "indicacao",
  "mocao",
  "requerimento",
  "pedido_de_informacao",
  "projeto_de_decreto",
  "outro",
] as const;

const ESFERAS = ["municipal", "estadual", "federal"] as const;

const STATUS_PL = [
  "rascunho",
  "apresentado",
  "em_tramitacao",
  "em_comissao",
  "aprovado_comissao",
  "em_plenario",
  "aprovado",
  "vetado",
  "promulgado",
  "arquivado",
  "retirado",
] as const;

const PRIORIDADES = ["baixa", "normal", "alta", "urgente"] as const;

const atualizarProjetoLeiSchema = z
  .object({
    numero: z.string().min(1).max(100),
    tipo: z.enum(TIPOS),
    esfera: z.enum(ESFERAS),
    titulo: z.string().min(1).max(500),
    ementa: z.string().max(5000).nullable(),
    descricao: z.string().max(10000).nullable(),
    tema: z.string().max(255).nullable(),
    url_oficial: z.string().url().max(2000).nullable(),
    autor_mandatario: z.boolean(),
    coautores: z.array(z.string().max(255)).max(50).nullable(),
    data_apresentacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    data_ultima_movimentacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    status: z.enum(STATUS_PL),
    comissao_atual: z.string().max(255).nullable(),
    relator: z.string().max(255).nullable(),
    prioridade: z.enum(PRIORIDADES),
    alinhamento_campanha: z.boolean(),
    temas_campanha: z.array(z.string().max(255)).max(20).nullable(),
    alertas_ativos: z.boolean(),
  })
  .partial();

// -- Helpers ------------------------------------------------------------------

async function buscarProjetoLei(db: ReturnType<typeof createAdminClient>, id: string, orgId: string) {
  return db
    .from("pol_projetos_lei")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
}

// -- GET ----------------------------------------------------------------------

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("viewer", { requestId, resource: "pol_projetos_lei" });
  if (!authz.ok) return authz.response;

  const db = createAdminClient();
  const { data: projetoLei, error } = await buscarProjetoLei(db, id, authz.org.orgId);

  if (error || !projetoLei) {
    return fail("not_found", "Projeto de lei nao encontrado", 404, { requestId });
  }

  return ok({ pol_projeto_lei: projetoLei }, { headers: { "x-request-id": requestId } });
}

// -- PATCH --------------------------------------------------------------------

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("manager", { requestId, resource: "pol_projetos_lei" });
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

  const parsed = atualizarProjetoLeiSchema.safeParse(body);
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
    .from("pol_projetos_lei")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (errBusca || !existente) {
    return fail("not_found", "Projeto de lei nao encontrado", 404, { requestId });
  }

  const { data: atualizado, error: errUpdate } = await db
    .from("pol_projetos_lei")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", orgId)
    .select()
    .single();

  if (errUpdate) {
    if (errUpdate.code === "23505") {
      return fail("conflict", "Ja existe projeto com este numero nesta organizacao", 409, {
        requestId,
      });
    }
    return fail("internal_error", "Erro ao atualizar pol_projeto_lei", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_projetos_lei.update",
    resource_id: id,
    metadata: { campos_alterados: Object.keys(parsed.data) },
  });

  return ok({ pol_projeto_lei: atualizado }, { headers: { "x-request-id": requestId } });
}

// -- DELETE -------------------------------------------------------------------

export async function DELETE(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("manager", { requestId, resource: "pol_projetos_lei" });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const denied = await requireSupportWrite(orgId);
  if (denied) return denied;

  const db = createAdminClient();

  const { data: existente, error: errBusca } = await db
    .from("pol_projetos_lei")
    .select("id, numero, titulo")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (errBusca || !existente) {
    return fail("not_found", "Projeto de lei nao encontrado", 404, { requestId });
  }

  const { error: errDelete } = await db
    .from("pol_projetos_lei")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (errDelete) {
    return fail("internal_error", "Erro ao deletar pol_projeto_lei", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_projetos_lei.delete",
    resource_id: id,
    metadata: { numero: existente.numero, titulo: existente.titulo },
  });

  return ok({ deleted: true }, { headers: { "x-request-id": requestId } });
}

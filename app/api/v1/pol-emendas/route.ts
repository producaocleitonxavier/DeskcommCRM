/**
 * GET|POST /api/v1/pol-emendas
 *
 * CRUD de emendas parlamentares — valores, destino e execucao orcamentaria.
 *
 * GET  — lista pol_emendas da organizacao. Aceita ?tipo=, ?status=, ?esfera=,
 *        ?ano=, ?area_tematica=, ?municipio=. Paginacao limit/offset.
 *        Ordenado por ano desc, created_at desc.
 * POST — cria nova emenda. Requer role manager.
 *
 * Seguranca: organizacao resolvida do cookie/JWT (fonte confiavel). Nunca do body.
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

const criarEmendaSchema = z.object({
  numero: z.string().max(100).nullable().optional(),
  ano: z.number().int().min(2000).max(2100),
  tipo: z.enum(TIPOS_EMENDA).default("individual"),
  esfera: z.enum(ESFERAS).default("estadual"),
  valor_indicado_cents: z.number().int().min(0).default(0),
  valor_empenhado_cents: z.number().int().min(0).default(0),
  valor_liquidado_cents: z.number().int().min(0).default(0),
  valor_pago_cents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("BRL"),
  municipio: z.string().max(255).nullable().optional(),
  entidade_beneficiada: z.string().max(500).nullable().optional(),
  cnpj_entidade: z.string().max(18).nullable().optional(),
  territory_id: z.string().uuid().nullable().optional(),
  area_tematica: z.enum(AREAS_TEMATICAS).default("saude"),
  descricao: z.string().min(1).max(5000),
  objeto: z.string().max(5000).nullable().optional(),
  status: z.enum(STATUS_EMENDA).default("indicada"),
  data_indicacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  data_empenho: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  data_liquidacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  data_pagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  prazo_execucao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  beneficiarios_estimados: z.number().int().min(0).nullable().optional(),
  lideranca_id: z.string().uuid().nullable().optional(),
  visibilidade: z.enum(VISIBILIDADES).default("publica"),
  observacoes: z.string().max(5000).nullable().optional(),
});

// -- GET — listar pol_emendas -------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "pol_emendas" });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const db = createAdminClient();
  const params = req.nextUrl.searchParams;

  let query = db
    .from("pol_emendas")
    .select(
      "id, numero, ano, tipo, esfera, valor_indicado_cents, valor_empenhado_cents, valor_liquidado_cents, valor_pago_cents, currency, municipio, entidade_beneficiada, cnpj_entidade, territory_id, area_tematica, descricao, objeto, status, data_indicacao, data_empenho, data_liquidacao, data_pagamento, prazo_execucao, beneficiarios_estimados, lideranca_id, visibilidade, observacoes, created_at, updated_at",
    )
    .eq("organization_id", orgId)
    .order("ano", { ascending: false })
    .order("created_at", { ascending: false });

  // Filtros opcionais
  const tipo = params.get("tipo");
  if (tipo) query = query.eq("tipo", tipo);

  const status = params.get("status");
  if (status) query = query.eq("status", status);

  const esfera = params.get("esfera");
  if (esfera) query = query.eq("esfera", esfera);

  const ano = params.get("ano");
  if (ano) query = query.eq("ano", parseInt(ano, 10));

  const areaTematica = params.get("area_tematica");
  if (areaTematica) query = query.eq("area_tematica", areaTematica);

  const municipio = params.get("municipio");
  if (municipio) query = query.ilike("municipio", `%${municipio}%`);

  // Paginacao simples
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 100);
  const offset = parseInt(params.get("offset") ?? "0", 10);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return fail("internal_error", "Erro ao buscar pol_emendas", 500, { requestId });
  }

  return ok(
    { pol_emendas: data ?? [] },
    {
      headers: { "x-request-id": requestId },
      meta: { total: count ?? (data?.length ?? 0), limit, offset },
    },
  );
}

// -- POST — criar pol_emenda --------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

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

  const parsed = criarEmendaSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Dados invalidos", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const db = createAdminClient();

  const { data: emenda, error } = await db
    .from("pol_emendas")
    .insert({
      organization_id: orgId,
      numero: parsed.data.numero ?? null,
      ano: parsed.data.ano,
      tipo: parsed.data.tipo,
      esfera: parsed.data.esfera,
      valor_indicado_cents: parsed.data.valor_indicado_cents,
      valor_empenhado_cents: parsed.data.valor_empenhado_cents,
      valor_liquidado_cents: parsed.data.valor_liquidado_cents,
      valor_pago_cents: parsed.data.valor_pago_cents,
      currency: parsed.data.currency,
      municipio: parsed.data.municipio ?? null,
      entidade_beneficiada: parsed.data.entidade_beneficiada ?? null,
      cnpj_entidade: parsed.data.cnpj_entidade ?? null,
      territory_id: parsed.data.territory_id ?? null,
      area_tematica: parsed.data.area_tematica,
      descricao: parsed.data.descricao,
      objeto: parsed.data.objeto ?? null,
      status: parsed.data.status,
      data_indicacao: parsed.data.data_indicacao ?? null,
      data_empenho: parsed.data.data_empenho ?? null,
      data_liquidacao: parsed.data.data_liquidacao ?? null,
      data_pagamento: parsed.data.data_pagamento ?? null,
      prazo_execucao: parsed.data.prazo_execucao ?? null,
      beneficiarios_estimados: parsed.data.beneficiarios_estimados ?? null,
      lideranca_id: parsed.data.lideranca_id ?? null,
      visibilidade: parsed.data.visibilidade,
      observacoes: parsed.data.observacoes ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23503") {
      return fail("bad_request", "Referencia invalida (territory_id ou lideranca_id)", 400, {
        requestId,
      });
    }
    return fail("internal_error", "Erro ao criar pol_emenda", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_emendas.create",
    resource_id: emenda.id,
    metadata: {
      descricao: emenda.descricao.slice(0, 100),
      valor_indicado_cents: emenda.valor_indicado_cents,
      area_tematica: emenda.area_tematica,
    },
  });

  return ok({ pol_emenda: emenda }, { status: 201, headers: { "x-request-id": requestId } });
}

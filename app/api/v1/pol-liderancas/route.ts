/**
 * GET|POST /api/v1/pol-liderancas
 *
 * CRUD de liderancas politicas — rede de cabos eleitorais, coordenadores,
 * lideres comunitarios etc.
 *
 * GET  — lista pol_liderancas da organizacao. Aceita ?tipo=, ?status=,
 *        ?nivel_engajamento=, ?territory_id=. Paginacao limit/offset.
 * POST — cria nova lideranca. Requer role manager.
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

const criarLiderancaSchema = z.object({
  nome: z.string().min(1).max(255),
  apelido: z.string().max(255).nullable().optional(),
  cargo: z.string().max(500).nullable().optional(),
  tipo: z.enum(TIPOS).default("cabo_eleitoral"),
  whatsapp: z.string().max(20).nullable().optional(),
  aniversario: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contact_id: z.string().uuid(),
  pol_lead_id: z.string().uuid().nullable().optional(),
  territory_id: z.string().uuid().nullable().optional(),
  cidade: z.string().max(255).nullable().optional(),
  bairro: z.string().max(255).nullable().optional(),
  zona_eleitoral: z.string().max(100).nullable().optional(),
  nivel_engajamento: z.enum(NIVEIS_ENGAJAMENTO).default("medio"),
  status: z.enum(STATUS_LIDERANCA).default("ativo"),
  observacoes: z.string().max(5000).nullable().optional(),
  leads_mobilizados: z.number().int().min(0).default(0),
  eventos_organizados: z.number().int().min(0).default(0),
});

// -- GET — listar pol_liderancas ----------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "pol_liderancas" });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const db = createAdminClient();
  const params = req.nextUrl.searchParams;

  let query = db
    .from("pol_liderancas")
    .select(
      "id, nome, apelido, cargo, tipo, whatsapp, aniversario, contact_id, pol_lead_id, territory_id, cidade, bairro, zona_eleitoral, leads_mobilizados, eventos_organizados, ultimo_contato_em, nivel_engajamento, status, observacoes, created_at, updated_at",
    )
    .eq("organization_id", orgId)
    .order("nome");

  // Filtros opcionais
  const tipo = params.get("tipo");
  if (tipo) query = query.eq("tipo", tipo);

  const status = params.get("status");
  if (status) query = query.eq("status", status);

  const nivelEngajamento = params.get("nivel_engajamento");
  if (nivelEngajamento) query = query.eq("nivel_engajamento", nivelEngajamento);

  const territoryId = params.get("territory_id");
  if (territoryId) query = query.eq("territory_id", territoryId);

  // Paginacao simples
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 100);
  const offset = parseInt(params.get("offset") ?? "0", 10);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return fail("internal_error", "Erro ao buscar pol_liderancas", 500, { requestId });
  }

  return ok(
    { pol_liderancas: data ?? [] },
    {
      headers: { "x-request-id": requestId },
      meta: { total: count ?? (data?.length ?? 0), limit, offset },
    },
  );
}

// -- POST — criar pol_lideranca -----------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

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

  const parsed = criarLiderancaSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Dados invalidos", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const db = createAdminClient();

  const { data: lideranca, error } = await db
    .from("pol_liderancas")
    .insert({
      organization_id: orgId,
      nome: parsed.data.nome,
      apelido: parsed.data.apelido ?? null,
      cargo: parsed.data.cargo ?? null,
      tipo: parsed.data.tipo,
      whatsapp: parsed.data.whatsapp ?? null,
      aniversario: parsed.data.aniversario ?? null,
      contact_id: parsed.data.contact_id,
      pol_lead_id: parsed.data.pol_lead_id ?? null,
      territory_id: parsed.data.territory_id ?? null,
      cidade: parsed.data.cidade ?? null,
      bairro: parsed.data.bairro ?? null,
      zona_eleitoral: parsed.data.zona_eleitoral ?? null,
      nivel_engajamento: parsed.data.nivel_engajamento,
      status: parsed.data.status,
      observacoes: parsed.data.observacoes ?? null,
      leads_mobilizados: parsed.data.leads_mobilizados,
      eventos_organizados: parsed.data.eventos_organizados,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return fail("conflict", "Lideranca ja cadastrada para este contato nesta organizacao", 409, {
        requestId,
      });
    }
    if (error.code === "23503") {
      return fail("bad_request", "Referencia invalida (contact_id, territory_id ou pol_lead_id)", 400, {
        requestId,
      });
    }
    return fail("internal_error", "Erro ao criar pol_lideranca", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_liderancas.create",
    resource_id: lideranca.id,
    metadata: { nome: lideranca.nome, tipo: lideranca.tipo },
  });

  return ok({ pol_lideranca: lideranca }, { status: 201, headers: { "x-request-id": requestId } });
}

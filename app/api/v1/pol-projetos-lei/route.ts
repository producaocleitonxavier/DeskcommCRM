/**
 * GET|POST /api/v1/pol-projetos-lei
 *
 * CRUD de projetos de lei, indicacoes, mocoes e requerimentos.
 *
 * GET  — lista pol_projetos_lei da organizacao. Aceita ?tipo=, ?status=,
 *        ?esfera=, ?prioridade=, ?autor_mandatario=, ?alinhamento_campanha=.
 *        Paginacao limit/offset. Ordenado por data_ultima_movimentacao desc.
 * POST — cria novo projeto de lei. Requer role manager.
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

const criarProjetoLeiSchema = z.object({
  numero: z.string().min(1).max(100),
  tipo: z.enum(TIPOS).default("projeto_de_lei"),
  esfera: z.enum(ESFERAS).default("municipal"),
  titulo: z.string().min(1).max(500),
  ementa: z.string().max(5000).nullable().optional(),
  descricao: z.string().max(10000).nullable().optional(),
  tema: z.string().max(255).nullable().optional(),
  url_oficial: z.string().url().max(2000).nullable().optional(),
  autor_mandatario: z.boolean().default(true),
  coautores: z.array(z.string().max(255)).max(50).nullable().optional(),
  data_apresentacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  data_ultima_movimentacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(STATUS_PL).default("em_tramitacao"),
  comissao_atual: z.string().max(255).nullable().optional(),
  relator: z.string().max(255).nullable().optional(),
  prioridade: z.enum(PRIORIDADES).default("normal"),
  alinhamento_campanha: z.boolean().default(false),
  temas_campanha: z.array(z.string().max(255)).max(20).nullable().optional(),
  alertas_ativos: z.boolean().default(true),
});

// -- GET — listar pol_projetos_lei --------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "pol_projetos_lei" });
  if (!authz.ok) return authz.response;

  const orgId = authz.org.orgId;
  const db = createAdminClient();
  const params = req.nextUrl.searchParams;

  let query = db
    .from("pol_projetos_lei")
    .select(
      "id, numero, tipo, esfera, titulo, ementa, descricao, tema, url_oficial, autor_mandatario, coautores, data_apresentacao, data_ultima_movimentacao, status, comissao_atual, relator, prioridade, alinhamento_campanha, temas_campanha, alertas_ativos, created_at, updated_at",
    )
    .eq("organization_id", orgId)
    .order("data_ultima_movimentacao", { ascending: false, nullsFirst: false });

  // Filtros opcionais
  const tipo = params.get("tipo");
  if (tipo) query = query.eq("tipo", tipo);

  const status = params.get("status");
  if (status) query = query.eq("status", status);

  const esfera = params.get("esfera");
  if (esfera) query = query.eq("esfera", esfera);

  const prioridade = params.get("prioridade");
  if (prioridade) query = query.eq("prioridade", prioridade);

  const autorMandatario = params.get("autor_mandatario");
  if (autorMandatario !== null) query = query.eq("autor_mandatario", autorMandatario === "true");

  const alinhamentoCampanha = params.get("alinhamento_campanha");
  if (alinhamentoCampanha !== null) query = query.eq("alinhamento_campanha", alinhamentoCampanha === "true");

  // Paginacao simples
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 100);
  const offset = parseInt(params.get("offset") ?? "0", 10);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return fail("internal_error", "Erro ao buscar pol_projetos_lei", 500, { requestId });
  }

  return ok(
    { pol_projetos_lei: data ?? [] },
    {
      headers: { "x-request-id": requestId },
      meta: { total: count ?? (data?.length ?? 0), limit, offset },
    },
  );
}

// -- POST — criar pol_projeto_lei ---------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

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

  const parsed = criarProjetoLeiSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Dados invalidos", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const db = createAdminClient();

  const { data: projetoLei, error } = await db
    .from("pol_projetos_lei")
    .insert({
      organization_id: orgId,
      numero: parsed.data.numero,
      tipo: parsed.data.tipo,
      esfera: parsed.data.esfera,
      titulo: parsed.data.titulo,
      ementa: parsed.data.ementa ?? null,
      descricao: parsed.data.descricao ?? null,
      tema: parsed.data.tema ?? null,
      url_oficial: parsed.data.url_oficial ?? null,
      autor_mandatario: parsed.data.autor_mandatario,
      coautores: parsed.data.coautores ?? null,
      data_apresentacao: parsed.data.data_apresentacao ?? null,
      data_ultima_movimentacao: parsed.data.data_ultima_movimentacao ?? null,
      status: parsed.data.status,
      comissao_atual: parsed.data.comissao_atual ?? null,
      relator: parsed.data.relator ?? null,
      prioridade: parsed.data.prioridade,
      alinhamento_campanha: parsed.data.alinhamento_campanha,
      temas_campanha: parsed.data.temas_campanha ?? null,
      alertas_ativos: parsed.data.alertas_ativos,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return fail("conflict", "Ja existe projeto com este numero nesta organizacao", 409, {
        requestId,
      });
    }
    return fail("internal_error", "Erro ao criar pol_projeto_lei", 500, { requestId });
  }

  // Audit log
  await db.from("api_audit_log").insert({
    organization_id: orgId,
    user_id: userId,
    action: "pol_projetos_lei.create",
    resource_id: projetoLei.id,
    metadata: { numero: projetoLei.numero, titulo: projetoLei.titulo, tipo: projetoLei.tipo },
  });

  return ok({ pol_projeto_lei: projetoLei }, { status: 201, headers: { "x-request-id": requestId } });
}

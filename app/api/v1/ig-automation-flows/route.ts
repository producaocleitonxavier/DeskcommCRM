/**
 * GET|POST /api/v1/ig-automation-flows
 *
 * CRUD de flows de automação do Instagram — o "ManyChat próprio" do GIP War Room.
 *
 * GET  — lista os flows da organização. Aceita ?ativo=true/false e ?trigger_tipo=.
 * POST — cria um novo flow. Requer role manager.
 *
 * Segurança: organização resolvida do cookie/JWT (fonte confiável). Nunca do body.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSupportWrite } from "@/lib/impersonate/support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Validação ──────────────────────────────────────────────────────────────────

const TRIGGER_TIPOS = [
  "comment_keyword",
  "comment_no_post",
  "dm_keyword",
  "novo_seguidor",
  "story_reply",
  "novo_comentario",
] as const;

const ACAO_TIPOS = [
  "enviar_dm",
  "responder_comentario",
  "add_etiqueta",
  "criar_contato",
  "notificar_equipe",
  "add_funil_politico",
] as const;

const acaoSchema = z.object({
  tipo: z.enum(ACAO_TIPOS),
  texto: z.string().optional(),
  etiqueta: z.string().optional(),
  pipeline_id: z.string().uuid().optional(),
  nivel: z.string().optional(),
  mensagem: z.string().optional(),
  assignee_user_id: z.string().uuid().optional(),
});

const criarFlowSchema = z.object({
  nome: z.string().min(1).max(120),
  descricao: z.string().max(500).optional(),
  ativo: z.boolean().default(true),
  trigger_tipo: z.enum(TRIGGER_TIPOS),
  trigger_config: z
    .object({
      keywords: z.array(z.string()).optional(),
      case_sensitive: z.boolean().optional(),
      post_ids: z.array(z.string()).optional(),
      story_id: z.string().optional(),
    })
    .default({}),
  acoes: z.array(acaoSchema).min(1).max(10),
});

// ── GET — listar flows ────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "ig_automation_flows" });
  if (!authz.ok) return authz.response;

  const db = createAdminClient();
  const params = req.nextUrl.searchParams;

  let query = db
    .from("ig_automation_flows")
    .select(
      "id, nome, descricao, ativo, trigger_tipo, trigger_config, acoes, stats, ultima_ativacao_at, created_at, updated_at",
    )
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false });

  // Filtros opcionais
  const ativoParam = params.get("ativo");
  if (ativoParam === "true") query = query.eq("ativo", true);
  if (ativoParam === "false") query = query.eq("ativo", false);

  const triggerTipo = params.get("trigger_tipo");
  if (triggerTipo) query = query.eq("trigger_tipo", triggerTipo);

  // Paginação simples
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 100);
  const offset = parseInt(params.get("offset") ?? "0", 10);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return fail("internal_error", "Erro ao buscar flows", 500, { requestId });
  }

  return ok(
    { flows: data ?? [] },
    {
      headers: { "x-request-id": requestId },
      meta: { total: count ?? (data?.length ?? 0), limit, offset },
    },
  );
}

// ── POST — criar flow ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();

  const authz = await requireRole("manager", { requestId, resource: "ig_automation_flows" });
  if (!authz.ok) return authz.response;

  const supportDenied = await requireSupportWrite(authz.org.orgId);
  if (supportDenied) return supportDenied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON inválido", 400, { requestId });
  }

  const parsed = criarFlowSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Dados inválidos", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const db = createAdminClient();
  const { data: flow, error } = await db
    .from("ig_automation_flows")
    .insert({
      organization_id: authz.org.orgId,
      nome: parsed.data.nome,
      descricao: parsed.data.descricao ?? null,
      ativo: parsed.data.ativo,
      trigger_tipo: parsed.data.trigger_tipo,
      trigger_config: parsed.data.trigger_config,
      acoes: parsed.data.acoes,
    })
    .select()
    .single();

  if (error) {
    return fail("internal_error", "Erro ao criar flow", 500, { requestId });
  }

  void audit({
    action: "ig_automation_flows.create",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceId: flow.id,
    requestId,
    metadata: { nome: flow.nome, trigger_tipo: flow.trigger_tipo },
  });

  return ok({ flow }, { status: 201, headers: { "x-request-id": requestId } });
}

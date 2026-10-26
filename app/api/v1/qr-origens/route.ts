/**
 * GET  /api/v1/qr-origens — as origens de QR (com a contagem de cadastros).
 * POST /api/v1/qr-origens — cria uma origem (gera o código, monta o link).
 *
 * Papel `manager`: criar um ponto de captação é gesto de operação, como o
 * disparo. A RLS das `pol_qr_*` é a segunda tranca.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { sugerirCodigo } from "@/lib/politico/qr-link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS = "id, nome, codigo, material_id, channel_session_id, mensagem, ativo, created_at";

const criarSchema = z.object({
  nome: z.string().min(1).max(120),
  mensagem: z.string().min(1).max(600),
  material_id: z.string().uuid().nullable().optional(),
  channel_session_id: z.string().uuid().nullable().optional(),
});

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "qr-origens" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data: origens } = await supabase
    .from("pol_qr_origens")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false });

  // Contagem de cadastros por origem — tally em memória (poucas origens).
  const { data: cads } = await supabase
    .from("pol_qr_cadastros")
    .select("origem_id, material_entregue_at")
    .eq("organization_id", authz.org.orgId);
  const porOrigem = new Map<string, { total: number; entregues: number }>();
  for (const c of (cads ?? []) as { origem_id: string; material_entregue_at: string | null }[]) {
    const e = porOrigem.get(c.origem_id) ?? { total: 0, entregues: 0 };
    e.total += 1;
    if (c.material_entregue_at) e.entregues += 1;
    porOrigem.set(c.origem_id, e);
  }

  const lista = ((origens ?? []) as Record<string, unknown>[]).map((o) => ({
    ...o,
    cadastros: porOrigem.get(o.id as string)?.total ?? 0,
    materiais_entregues: porOrigem.get(o.id as string)?.entregues ?? 0,
  }));

  return ok(lista, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "qr-origens" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = criarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const entrada = parsed.data;

  const supabase = createAdminClient();

  // Código único na org, derivado do nome.
  const { data: existentes } = await supabase
    .from("pol_qr_origens")
    .select("codigo")
    .eq("organization_id", authz.org.orgId);
  const codigo = sugerirCodigo(
    entrada.nome,
    ((existentes ?? []) as { codigo: string }[]).map((e) => e.codigo),
  );

  const { data, error } = await supabase
    .from("pol_qr_origens")
    .insert({
      organization_id: authz.org.orgId,
      nome: entrada.nome,
      codigo,
      mensagem: entrada.mensagem,
      material_id: entrada.material_id ?? null,
      channel_session_id: entrada.channel_session_id ?? null,
      created_by: authz.user.id,
    })
    .select(COLUNAS)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "pol_qr_origem.created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "pol_qr_origem",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { codigo },
  });

  return ok({ ...(data as object), cadastros: 0, materiais_entregues: 0 }, { requestId });
}

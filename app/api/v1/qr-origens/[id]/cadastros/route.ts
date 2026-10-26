/**
 * GET /api/v1/qr-origens/:id/cadastros — QUEM se cadastrou por este QR.
 *
 * Nome, quando, e se o material foi entregue. Para a tela de Captação mostrar a
 * lista de pessoas por trás do número do card.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "qr-origens" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("pol_qr_cadastros")
    .select("contact_id, created_at, material_entregue_at, contacts(name, display_name, phone_number)")
    .eq("organization_id", authz.org.orgId)
    .eq("origem_id", id)
    .order("created_at", { ascending: false })
    .limit(500);

  const lista = ((data ?? []) as unknown as Array<{
    contact_id: string;
    created_at: string;
    material_entregue_at: string | null;
    contacts: { name: string | null; display_name: string | null; phone_number: string | null } | null;
  }>).map((r) => ({
    contact_id: r.contact_id,
    nome: r.contacts?.name ?? r.contacts?.display_name ?? r.contacts?.phone_number ?? "Sem nome",
    telefone: r.contacts?.phone_number ?? null,
    created_at: r.created_at,
    recebeu_material: !!r.material_entregue_at,
  }));

  return ok(lista, { requestId });
}

/**
 * POST /api/v1/perfil/public/[token]
 *
 * Rota PÚBLICA (sem auth) do perfilamento progressivo. O token opaco
 * (contacts.perfil_token) identifica o contato → grava cidade/bairro em
 * custom_fields (MESCLANDO, raiz) e o aniversário em `birthdate` com ANO SENTINELA
 * 2000 (a coluna gerada `birthday_md` deriva daí e alimenta a régua de aniversário
 * que já existe). org SEMPRE do registro, nunca do body.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Ano sentinela 2000 (bissexto → 29/02 funciona). O ano é fictício: só guardamos
// dia e mês (o cliente não quer revelar a idade). birthday_md = mês*100 + dia.
const DIAS_NO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = (n: number) => String(n).padStart(2, "0");

const schema = z.object({
  cidade: z.string().trim().min(2).max(120),
  bairro: z.string().trim().min(2).max(120),
  dia: z.number().int().min(1).max(31).nullable().optional(),
  mes: z.number().int().min(1).max(12).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await params;
  if (!token || token.length < 16) {
    return fail("not_found", "Link inválido", 404, { requestId });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON inválido", 400, { requestId });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Dados inválidos", 422, { requestId, details: parsed.error.flatten() });
  }
  const { cidade, bairro, dia, mes } = parsed.data;

  const db = createAdminClient();
  const { data: contato } = await db
    .from("contacts")
    .select("id, organization_id, custom_fields")
    .eq("perfil_token", token)
    .maybeSingle();
  const c = contato as { id: string; organization_id: string; custom_fields: Record<string, unknown> | null } | null;
  if (!c) return fail("not_found", "Link inválido ou expirado", 404, { requestId });

  // Monta o patch: custom_fields mesclado (cidade/bairro na raiz) + birthdate.
  const cf = { ...(c.custom_fields ?? {}) };
  cf.cidade = cidade;
  cf.bairro = bairro;
  const patch: Record<string, unknown> = { custom_fields: cf };

  // Aniversário (dia+mês) → birthdate "2000-MM-DD", só se o dia couber no mês.
  if (dia != null && mes != null) {
    if (dia > DIAS_NO_MES[mes - 1]!) {
      return fail("validation_error", "Dia inválido para o mês escolhido.", 422, { requestId });
    }
    patch.birthdate = `2000-${pad(mes)}-${pad(dia)}`;
  }

  const { error } = await db
    .from("contacts")
    .update(patch)
    .eq("id", c.id)
    .eq("organization_id", c.organization_id);
  if (error) return fail("internal_error", "Erro ao salvar", 500, { requestId });

  return ok({ saved: true }, { headers: { "x-request-id": requestId } });
}

/**
 * POST /api/v1/avaliar/public/[token]
 *
 * Rota PÚBLICA (sem auth) da Nota do cidadão. O token opaco
 * (demandas.pol_avaliacao_token) identifica a demanda; a organização vem SEMPRE
 * do registro, nunca do corpo. Uma resposta por demanda: o UPDATE só grava se a
 * nota ainda está vazia — quem responde duas vezes recebe "já avaliada".
 * Registra no histórico da demanda (trilha que o gabinete lê).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { NOTA_MAX, NOTA_MIN, ROTULO_DA_NOTA } from "@/lib/politico/avaliacao-texto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  nota: z.number().int().min(NOTA_MIN).max(NOTA_MAX),
  comentario: z.string().trim().max(600).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await params;
  if (!token || !/^[0-9a-f]{32}$/i.test(token)) {
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
  const { nota } = parsed.data;
  const comentario = (parsed.data.comentario ?? "").trim() || null;

  const db = createAdminClient();
  const { data: gravada, error } = await db
    .from("demandas")
    .update({ pol_avaliacao_nota: nota, pol_avaliacao_comentario: comentario, pol_avaliacao_em: new Date().toISOString() })
    .eq("pol_avaliacao_token", token)
    .is("pol_avaliacao_nota", null)
    .select("id, organization_id")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao salvar", 500, { requestId });

  const d = gravada as { id: string; organization_id: string } | null;
  if (!d) {
    // Ou o link não existe, ou a demanda já foi avaliada — distingue para a tela.
    const { data: existe } = await db.from("demandas").select("id").eq("pol_avaliacao_token", token).maybeSingle();
    if (!existe) return fail("not_found", "Link inválido ou expirado", 404, { requestId });
    return fail("conflict", "Esta avaliação já foi respondida", 409, { requestId });
  }

  await db.from("pol_demanda_eventos").insert({
    organization_id: d.organization_id,
    demanda_id: d.id,
    tipo: "nota",
    descricao: `Cidadão avaliou o atendimento: nota ${nota} de ${NOTA_MAX} (${ROTULO_DA_NOTA[nota] ?? ""})${comentario ? ` — "${comentario}"` : ""}`,
  });

  return ok({ saved: true }, { headers: { "x-request-id": requestId } });
}

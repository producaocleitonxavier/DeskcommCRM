/**
 * POST /api/public/captacao-emenda/[emenda] — captação PÚBLICA por emenda.
 *
 * A entidade beneficiada pela emenda compartilha /e/<uuid>; quem se cadastra
 * entra na base da organização JÁ ATRIBUÍDO à emenda (pol_leads.pol_emenda_id).
 * Camada 2 do ROI de Emenda. SEM sessão: a org vem só da emenda no servidor.
 * Espelha /api/public/captacao-obra. Honeypot + rate-limit.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { createAdminClient } from "@/lib/supabase/admin";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  nome: z.string().trim().min(2).max(200),
  telefone: z.string().trim().min(8).max(32),
  cidade: z.string().trim().max(120).optional(),
  bairro: z.string().trim().max(120).optional(),
  website: z.string().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ emenda: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const { emenda: emendaId } = await ctx.params;
  if (!UUID.test(emendaId)) return fail("not_found", "Link inválido.", 404, { requestId });

  let body: unknown;
  try { body = await req.json(); } catch { return fail("bad_request", "JSON inválido.", 400, { requestId }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("validation_error", "Preencha nome e telefone.", 422, { requestId });

  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    return ok({ recebido: true }, { status: 201, requestId });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "desconhecido";
  const porIp = await checkRateLimit(`captacao-emenda:ip:${ip}`, 8, 300);
  const porEmenda = await checkRateLimit(`captacao-emenda:em:${emendaId}`, 120, 3600);
  if (!porIp.allowed || !porEmenda.allowed) {
    return fail("rate_limited", "Muitas tentativas. Tente novamente em alguns minutos.", 429, { requestId });
  }

  const admin = createAdminClient();
  const { data: emenda } = await admin.from("pol_emendas").select("id, organization_id, municipio, bairro").eq("id", emendaId).maybeSingle();
  if (!emenda) return fail("not_found", "Link inválido.", 404, { requestId });
  const em = emenda as { organization_id: string; municipio: string | null; bairro: string | null };
  const orgId = em.organization_id;

  const telefone = canonicalPhoneBR(parsed.data.telefone);
  if (!telefone || telefone.replace(/\D/g, "").length < 10) {
    return fail("validation_error", "Telefone inválido.", 422, { requestId });
  }

  const cidade = parsed.data.cidade || em.municipio || undefined;
  const bairro = parsed.data.bairro || em.bairro || undefined;
  const endereco: Record<string, unknown> = {};
  if (cidade) endereco.cidade = cidade;
  if (bairro) endereco.bairro = bairro;
  const customFields: Record<string, unknown> = { origem_captacao: "link_emenda" };
  if (Object.keys(endereco).length > 0) customFields.endereco_gip = endereco;

  let contactId: string;
  const existente = await encontrarContatoPorTelefone(admin as never, orgId, telefone);
  if (existente) {
    contactId = (existente as { id: string }).id;
  } else {
    const { data: novo, error: cErr } = await admin
      .from("contacts")
      .insert({ organization_id: orgId, name: parsed.data.nome, phone_number: telefone, source: "form", custom_fields: customFields })
      .select("id")
      .maybeSingle();
    if (cErr || !novo) {
      const retry = await encontrarContatoPorTelefone(admin as never, orgId, telefone);
      if (!retry) return fail("internal_error", "Não foi possível registrar.", 500, { requestId });
      contactId = (retry as { id: string }).id;
    } else {
      contactId = (novo as { id: string }).id;
    }
  }

  const { error: lErr } = await admin.from("pol_leads").insert({
    organization_id: orgId, contact_id: contactId, support_level: "novo_cadastro", temperature: "frio",
    pol_emenda_id: emendaId, consent_origin: "captacao_publica",
  });
  if (lErr && (lErr as { code?: string }).code === "23505") {
    await admin.from("pol_leads").update({ pol_emenda_id: emendaId }).eq("organization_id", orgId).eq("contact_id", contactId).is("pol_emenda_id", null);
  } else if (lErr) {
    return fail("internal_error", "Não foi possível registrar.", 500, { requestId });
  }

  return ok({ recebido: true }, { status: 201, requestId });
}

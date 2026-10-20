/**
 * POST /api/public/captacao-obra/[obra] — captação PÚBLICA por obra/entidade.
 *
 * A entidade/projeto beneficiado compartilha o link /o/<uuid>; quem se cadastra
 * entra na base da organização JÁ ATRIBUÍDO à obra (pol_leads.pol_obra_id),
 * alimentando os "beneficiários captados" — a base que o recurso (emenda/obra)
 * gerou naquele território. Camada 2 do ROI de Emenda. SEM sessão: a org vem
 * EXCLUSIVAMENTE da obra no servidor (nunca do corpo). Grava cidade/bairro em
 * custom_fields.endereco_gip (formato que o cruzamento de peso lê).
 *
 * Anti-abuso: honeypot (`website` vazio) + rate-limit por IP e por obra.
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
  website: z.string().optional(), // honeypot
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ obra: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const { obra: obraId } = await ctx.params;
  if (!UUID.test(obraId)) return fail("not_found", "Link inválido.", 404, { requestId });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON inválido.", 400, { requestId });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("validation_error", "Preencha nome e telefone.", 422, { requestId });

  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    return ok({ recebido: true }, { status: 201, requestId });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "desconhecido";
  const porIp = await checkRateLimit(`captacao-obra:ip:${ip}`, 8, 300);
  const porObra = await checkRateLimit(`captacao-obra:obra:${obraId}`, 120, 3600);
  if (!porIp.allowed || !porObra.allowed) {
    return fail("rate_limited", "Muitas tentativas. Tente novamente em alguns minutos.", 429, { requestId });
  }

  const admin = createAdminClient();

  // Org, cidade e bairro vêm da OBRA (nunca do cliente). O bairro default liga ao território.
  const { data: obra } = await admin.from("pol_obras").select("id, organization_id, municipio, bairro").eq("id", obraId).maybeSingle();
  if (!obra) return fail("not_found", "Link inválido.", 404, { requestId });
  const o = obra as { organization_id: string; municipio: string | null; bairro: string | null };
  const orgId = o.organization_id;

  const telefone = canonicalPhoneBR(parsed.data.telefone);
  if (!telefone || telefone.replace(/\D/g, "").length < 10) {
    return fail("validation_error", "Telefone inválido.", 422, { requestId });
  }

  const cidade = parsed.data.cidade || o.municipio || undefined;
  const bairro = parsed.data.bairro || o.bairro || undefined;
  const endereco: Record<string, unknown> = {};
  if (cidade) endereco.cidade = cidade;
  if (bairro) endereco.bairro = bairro;
  const customFields: Record<string, unknown> = { origem_captacao: "link_obra" };
  if (Object.keys(endereco).length > 0) customFields.endereco_gip = endereco;

  // Contato: reaproveita por telefone; senão cria.
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

  // Lead atribuído à obra. Se já existe, garante a atribuição quando vazia.
  const { error: lErr } = await admin.from("pol_leads").insert({
    organization_id: orgId,
    contact_id: contactId,
    support_level: "novo_cadastro",
    temperature: "frio",
    pol_obra_id: obraId,
    consent_origin: "captacao_publica",
  });
  if (lErr && (lErr as { code?: string }).code === "23505") {
    await admin.from("pol_leads").update({ pol_obra_id: obraId }).eq("organization_id", orgId).eq("contact_id", contactId).is("pol_obra_id", null);
  } else if (lErr) {
    return fail("internal_error", "Não foi possível registrar.", 500, { requestId });
  }

  return ok({ recebido: true }, { status: 201, requestId });
}

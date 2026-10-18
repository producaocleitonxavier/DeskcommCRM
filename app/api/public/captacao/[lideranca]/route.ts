/**
 * POST /api/public/captacao/[lideranca] — captação PÚBLICA por liderança.
 *
 * Link que a liderança compartilha: quem se cadastra por ele entra na base da
 * organização JÁ ATRIBUÍDO àquela liderança (pol_leads.pol_lideranca_id),
 * alimentando "pessoas indicadas". SEM sessão — a organização é derivada
 * EXCLUSIVAMENTE da liderança no servidor (nunca do corpo). Rota pública
 * (PUBLIC_PATHS); a identidade mora aqui dentro.
 *
 * Anti-abuso v1: honeypot (campo oculto `website` precisa vir vazio) + validação
 * mínima (nome + telefone). Registro com admin client, escopado à org da liderança.
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
  website: z.string().optional(), // honeypot: precisa vir vazio
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ lideranca: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const { lideranca: liderancaId } = await ctx.params;
  if (!UUID.test(liderancaId)) return fail("not_found", "Link inválido.", 404, { requestId });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON inválido.", 400, { requestId });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("validation_error", "Preencha nome e telefone.", 422, { requestId });

  // Honeypot: bot preencheu o campo oculto → finge sucesso, não grava nada.
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    return ok({ recebido: true }, { status: 201, requestId });
  }

  // Rate limit (endpoint público): por IP e por liderança. O UUID do link é
  // compartilhável (não secreto), então sem freio um bot poderia inflar a base.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "desconhecido";
  const porIp = await checkRateLimit(`captacao:ip:${ip}`, 8, 300);
  const porLid = await checkRateLimit(`captacao:lid:${liderancaId}`, 60, 3600);
  if (!porIp.allowed || !porLid.allowed) {
    return fail("rate_limited", "Muitas tentativas. Tente novamente em alguns minutos.", 429, { requestId });
  }

  const admin = createAdminClient();

  // Org e validade vêm SÓ da liderança (nunca do cliente).
  const { data: lid } = await admin
    .from("pol_liderancas")
    .select("id, organization_id, status")
    .eq("id", liderancaId)
    .maybeSingle();
  if (!lid) return fail("not_found", "Link inválido.", 404, { requestId });
  const orgId = (lid as { organization_id: string }).organization_id;

  const telefone = canonicalPhoneBR(parsed.data.telefone);
  if (!telefone || telefone.replace(/\D/g, "").length < 10) {
    return fail("validation_error", "Telefone inválido.", 422, { requestId });
  }

  const customFields: Record<string, unknown> = { origem_captacao: "link_lideranca" };
  if (parsed.data.cidade) customFields.cidade = parsed.data.cidade;
  if (parsed.data.bairro) customFields.bairro = parsed.data.bairro;

  // Contato: reaproveita se o telefone já existe na org; senão cria.
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
      // Corrida: tenta achar de novo por variante do telefone.
      const retry = await encontrarContatoPorTelefone(admin as never, orgId, telefone);
      if (!retry) return fail("internal_error", "Não foi possível registrar.", 500, { requestId });
      contactId = (retry as { id: string }).id;
    } else {
      contactId = (novo as { id: string }).id;
    }
  }

  // Lead político atribuído à liderança. Se já existe, garante a atribuição
  // quando estiver vazia (não rouba de outra liderança já creditada).
  const { error: lErr } = await admin.from("pol_leads").insert({
    organization_id: orgId,
    contact_id: contactId,
    support_level: "novo_cadastro",
    temperature: "frio",
    pol_lideranca_id: liderancaId,
    consent_origin: "captacao_publica",
  });
  if (lErr) {
    if ((lErr as { code?: string }).code === "23505") {
      await admin
        .from("pol_leads")
        .update({ pol_lideranca_id: liderancaId })
        .eq("organization_id", orgId)
        .eq("contact_id", contactId)
        .is("pol_lideranca_id", null);
    } else {
      return fail("internal_error", "Não foi possível registrar.", 500, { requestId });
    }
  }

  return ok({ recebido: true }, { status: 201, requestId });
}

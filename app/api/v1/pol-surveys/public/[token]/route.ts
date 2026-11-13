/**
 * GET|POST /api/v1/pol-surveys/public/[token]
 *
 * Rota PUBLICA de pesquisa politica — War Room 2.0 Fase 3.
 * Nao requer autenticacao. Resolve a pesquisa pelo public_token.
 *
 * GET  — retorna pesquisa + perguntas (ordenadas por `order`) para o token dado.
 *        Apenas pesquisas ativas.
 * POST — submete uma resposta. Cria uma linha em pol_survey_responses.
 *        Token da resposta gerado server-side.
 *
 * Seguranca: sem auth — rota publica por design (formulario de pesquisa).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { registrarIndicacao } from "@/lib/politico/indicacao";
import { recomputarEngajamento } from "@/lib/politico/engajamento";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// -- Validacao ----------------------------------------------------------------

// A pesquisa também CAPTURA o respondente (vira contato no CRM): nome, WhatsApp,
// cidade e bairro são obrigatórios.
const submeterRespostaSchema = z.object({
  answers: z
    .record(z.string().max(80), z.unknown())
    .refine((a) => Object.keys(a).length <= 100, "respostas demais")
    .refine((a) => JSON.stringify(a).length <= 20_000, "respostas longas demais"),
  // Campo-isca: gente não vê nem preenche; robô preenche.
  website: z.string().max(200).optional(),
  name: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().min(8).max(25),
  city: z.string().trim().min(2).max(120),
  bairro: z.string().trim().min(2).max(120),
  state: z.string().trim().length(2).nullable().optional(),
  duration_seconds: z.number().int().min(0).nullable().optional(),
  // ENQUETE COMPARTILHÁVEL: código pessoal do multiplicador que espalhou (do ?ind=
  // no link). Quem responde vira cadastro CREDITADO a ele (pol_indicacoes, +10).
  ind: z.string().trim().regex(/^[A-Za-z0-9]{4,12}$/).optional(),
});

/**
 * Normaliza um WhatsApp brasileiro digitado pelo cidadão para E.164 (+55…).
 * canonicalPhoneBR NÃO acrescenta o país — então garantimos o 55 antes (senão
 * "31 99436-2027" viraria "+31…", o bug conhecido). Devolve null se não parecer
 * um número BR válido (DDD + 8/9 dígitos).
 */
function normalizarWhatsBR(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  let full = d;
  if (!d.startsWith("55")) {
    if (d.length === 10 || d.length === 11) full = `55${d}`;
    else return null;
  }
  if (full.length < 12 || full.length > 13) return null;
  const canonico = canonicalPhoneBR(`+${full}`);
  return canonico.startsWith("+55") ? canonico : null;
}

// -- GET — pesquisa publica por token -----------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await params;

  const db = createAdminClient();

  // Buscar pesquisa ativa pelo public_token
  const { data: survey, error: errSurvey } = await db
    .from("pol_surveys")
    .select("id, title, description, type, status, start_date, end_date")
    .eq("public_token", token)
    .eq("status", "active")
    .single();

  if (errSurvey || !survey) {
    return fail("not_found", "Pesquisa nao encontrada ou nao esta ativa", 404, { requestId });
  }

  // Buscar perguntas ordenadas
  const { data: questions, error: errQuestions } = await db
    .from("pol_survey_questions")
    .select("id, question, response_type, options, required, \"order\"")
    .eq("survey_id", survey.id)
    .order("order", { ascending: true });

  if (errQuestions) {
    return fail("internal_error", "Erro ao buscar perguntas", 500, { requestId });
  }

  return ok(
    { survey, questions: questions ?? [] },
    { headers: { "x-request-id": requestId } },
  );
}

// -- POST — submeter resposta -------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON invalido", 400, { requestId });
  }

  const parsed = submeterRespostaSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Dados invalidos", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const db = createAdminClient();

  // Buscar pesquisa ativa pelo public_token
  const { data: survey, error: errSurvey } = await db
    .from("pol_surveys")
    .select("id, organization_id")
    .eq("public_token", token)
    .eq("status", "active")
    .single();

  if (errSurvey || !survey) {
    return fail("not_found", "Pesquisa nao encontrada ou nao esta ativa", 404, { requestId });
  }

  // Isca preenchida: finge sucesso e não grava nada.
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    return ok({ recebido: true }, { status: 201, headers: { "x-request-id": requestId } });
  }
  // Freio (rota pública): o link da pesquisa circula, então sem limite um robô
  // enchia a base de gente inventada e fabricava crédito de indicação
  // (auditoria de 13/nov/2026). Folgado o bastante para um evento num mesmo wi-fi.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "desconhecido";
  const porIp = await checkRateLimit(`pesquisa:ip:${ip}`, 20, 300);
  const porPesquisa = await checkRateLimit(`pesquisa:tk:${token}`, 600, 3600);
  if (!porIp.allowed || !porPesquisa.allowed) {
    return fail("rate_limited", "Muitas respostas em pouco tempo. Tente novamente em alguns minutos.", 429, { requestId });
  }

  const orgId = survey.organization_id as string;
  const nome = parsed.data.name.trim();
  const cidade = parsed.data.city.trim();
  const bairro = parsed.data.bairro.trim();
  const uf = parsed.data.state?.trim().toUpperCase().slice(0, 2) || null;

  // CAPTURA: o respondente vira contato no CRM (dedup por telefone, grafias BR).
  // Best-effort — se algo falhar, a RESPOSTA ainda é salva (nunca perder dado).
  let contactId: string | null = null;
  const phone = normalizarWhatsBR(parsed.data.whatsapp);
  if (!phone) {
    return fail("validation_error", "WhatsApp inválido. Informe DDD + número.", 422, { requestId });
  }
  try {
    const existente = await encontrarContatoPorTelefone(db, orgId, phone);
    if (existente) {
      contactId = existente.id;
      const { data: cRow } = await db.from("contacts").select("name, custom_fields").eq("id", contactId).maybeSingle();
      const cf = { ...(((cRow as { custom_fields?: Record<string, unknown> } | null)?.custom_fields) ?? {}) };
      // Só COMPLETA o que está vazio: digitar o telefone de alguém não prova ser
      // essa pessoa, então o que já está no cadastro não é trocado por aqui.
      if (!String(cf.cidade ?? "").trim()) cf.cidade = cidade;
      if (!String(cf.bairro ?? "").trim()) cf.bairro = bairro;
      const patch: Record<string, unknown> = { custom_fields: cf };
      if (!((cRow as { name?: string | null } | null)?.name ?? "").trim()) patch.name = nome;
      await db.from("contacts").update(patch).eq("id", contactId).eq("organization_id", orgId);
    } else {
      const { data: novo } = await db
        .from("contacts")
        .insert({
          organization_id: orgId,
          name: nome,
          phone_number: phone, // wa_identity é coluna GERADA (não inserir)
          source: "pesquisa",
          source_metadata: { survey_id: survey.id, survey_token: token },
          custom_fields: { cidade, bairro },
        })
        .select("id")
        .single();
      contactId = (novo as { id: string } | null)?.id ?? null;
    }
  } catch {
    contactId = null; // não bloqueia a resposta
  }

  // Uma resposta por pessoa por pesquisa: a segunda não vira nova linha (nem novo crédito).
  if (contactId) {
    const { data: jaRespondeu } = await db
      .from("pol_survey_responses")
      .select("id")
      .eq("organization_id", orgId)
      .eq("survey_id", survey.id)
      .eq("contact_id", contactId)
      .eq("completed", true)
      .limit(1);
    if ((jaRespondeu ?? []).length > 0) {
      return ok({ recebido: true, repetida: true }, { status: 201, headers: { "x-request-id": requestId } });
    }
  }

  // Token da resposta gerado server-side
  const responseToken = randomUUID().replace(/-/g, "");

  const { error } = await db
    .from("pol_survey_responses")
    .insert({
      organization_id: orgId,
      survey_id: survey.id,
      token: responseToken,
      answers: parsed.data.answers,
      contact_id: contactId,
      city: cidade,
      state: uf,
      completed: true,
      duration_seconds: parsed.data.duration_seconds ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return fail("internal_error", "Erro ao registrar resposta", 500, { requestId });
  }

  // ENQUETE COMPARTILHÁVEL: credita o multiplicador que espalhou (código do ?ind=).
  // Best-effort — a resposta JÁ foi salva; nada aqui pode derrubá-la. Vira "trouxe
  // +1" no placar dele (+10 no engajamento, via pol_indicacoes). O respondente vira
  // um lead simpatizante (cadastro de verdade no funil).
  if (parsed.data.ind && contactId) {
    try {
      const cred = await registrarIndicacao(db, orgId, contactId, parsed.data.ind.toUpperCase());
      if (cred.creditou) {
        const { data: leadExiste } = await db
          .from("pol_leads")
          .select("id")
          .eq("organization_id", orgId)
          .eq("contact_id", contactId)
          .maybeSingle();
        if (!leadExiste) {
          await db
            .from("pol_leads")
            .insert({ organization_id: orgId, contact_id: contactId, support_level: "simpatizante" });
        }
        await recomputarEngajamento(db, orgId, contactId, {
          reason: "Respondeu enquete por indicação",
          engajouAgora: true,
        });
      }
    } catch {
      // ignora — a resposta já está salva
    }
  }

  // Só confirma: a linha (com ids internos da organização e do contato) não volta
  // para quem está de fora.
  return ok({ recebido: true }, { status: 201, headers: { "x-request-id": requestId } });
}

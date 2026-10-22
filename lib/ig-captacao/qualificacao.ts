/**
 * Cérebro da qualificação por DM do funil de captação do Instagram (peça 2).
 *
 * Máquina de estados dirigida pelo ESTÁGIO do lead (custom_fields.captacao_estagio),
 * sem flag separada: o próprio estágio diz o que a próxima resposta significa.
 *
 *   interagiu/em_conversa (sem cidade)  → a resposta é a CIDADE
 *   qualificado_mgbh (sem whatsapp)     → a resposta é o WHATSAPP
 *
 * Fluxo quando chega a cidade:
 *   - no alvo (estaNoAlvo)  → estágio "qualificado_mgbh" + pede WhatsApp
 *   - fora do alvo          → estágio "fora_de_alvo" + entrega a isca (goodwill)
 * Quando chega o WhatsApp (de quem está no alvo):
 *   - grava telefone + consentimento → estágio "apoiador_whatsapp" → entrega a
 *     isca → GRADUA pro funil político (pol_leads simpatizante, só quando qualificado)
 *
 * NUNCA faz HTTP: as DMs de saída são emitidas como `ig.dm_outbound` no event_log
 * (o handler de canal despacha). Doutrina trigger≠HTTP.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { logger } from "@/lib/logger";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import {
  lerCaptacaoConfig,
  estaNoAlvo,
  type CaptacaoConfig,
} from "@/lib/politico/captacao-config";

export interface ResultadoQualificacao {
  status: "ok" | "skipped";
  detail: string;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

interface Localidade {
  cidade: string | null;
  uf: string | null;
}

/** Heurística (cidades do alvo mencionadas direto) + IA leve pra texto livre. */
async function extrairLocalidade(
  db: SupabaseClient,
  orgId: string,
  texto: string,
  config: CaptacaoConfig,
): Promise<Localidade> {
  const t = norm(texto);

  // 1) Heurística: a pessoa escreveu o nome de uma cidade do alvo.
  const doAlvo = [config.cidadeAlvo, ...config.cidadesExtra].filter(Boolean) as string[];
  for (const c of doAlvo) {
    if (t.includes(norm(c))) return { cidade: c, uf: config.estadoAlvo };
  }

  // 2) IA leve: extrai cidade/UF de uma frase curta ("sou de bh", "moro em contagem").
  try {
    const cerebro = await cerebroDaOrg(db, orgId);
    const { text } = await generateText({
      model: modeloDoCerebro(cerebro),
      system:
        'Extraia a cidade e a UF (sigla de 2 letras) que a pessoa diz morar ou ser, a partir de uma mensagem curta em português do Brasil. Entenda apelidos (ex.: "BH" = Belo Horizonte/MG). Responda SOMENTE um JSON {"cidade": "<nome>"|null, "uf": "<XX>"|null}. Nada fora do JSON.',
      prompt: texto.slice(0, 280),
      maxOutputTokens: 60,
    });
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]) as { cidade?: unknown; uf?: unknown };
      return {
        cidade: typeof j.cidade === "string" && j.cidade.trim() ? j.cidade.trim() : null,
        uf: typeof j.uf === "string" && j.uf.trim() ? j.uf.trim().toUpperCase().slice(0, 2) : null,
      };
    }
  } catch (err) {
    logger.warn("[captacao-qualificacao] extrairLocalidade IA falhou", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return { cidade: null, uf: null };
}

/**
 * Extrai um telefone BR do texto e devolve em E.164 (+55DDDNUMERO) — o formato
 * exigido pelo CHECK `contacts_phone_e164_format` (phone ~ '^\+\d{8,15}$').
 * null se não achar um número plausível.
 */
function extrairTelefone(texto: string): string | null {
  let d = texto.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); // tira o 55 se veio
  if (d.length === 10 || d.length === 11) return `+55${d}`; // DDD + número
  return null;
}

async function emitirDm(
  db: SupabaseClient,
  orgId: string,
  channelSessionId: string | null,
  toInstagramId: string,
  contactId: string,
  texto: string | null,
): Promise<void> {
  if (!texto || !channelSessionId) return;
  await db.from("event_log").insert({
    organization_id: orgId,
    event_type: "ig.dm_outbound",
    entity_kind: "contacts",
    entity_id: contactId,
    payload: {
      channel_session_id: channelSessionId,
      to_instagram_id: toInstagramId,
      texto,
      origem: "captacao_qualificacao",
    },
  });
}

/**
 * Cria o lead político (graduação) — SÓ quando qualificado. Idempotente.
 * NÃO toca em custom_fields (o caller já grava endereco_gip na mesma escrita do
 * contato, pra não haver 2ª escrita correndo com a 1ª e clobberando-a).
 */
async function graduar(db: SupabaseClient, orgId: string, contactId: string): Promise<void> {
  const { data: existe } = await db
    .from("pol_leads")
    .select("id")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (existe) return;

  const { error } = await db.from("pol_leads").insert({
    organization_id: orgId,
    contact_id: contactId,
    support_level: "simpatizante",
  });
  if (error && error.code !== "23505") {
    logger.error("[captacao-qualificacao] falha ao graduar pol_lead", { error: error.message });
  }
}

/**
 * Processa uma DM recebida de um lead de captação e avança a jornada.
 * `db` deve ser admin (bypass RLS). Idempotência é por estágio (não re-age).
 */
export async function qualificarPorDm(
  db: SupabaseClient,
  orgId: string,
  senderIgId: string,
  channelSessionId: string | null,
  texto: string,
): Promise<ResultadoQualificacao> {
  const config = await lerCaptacaoConfig(db, orgId);
  if (!config.ativo) return { status: "skipped", detail: "captacao_inativa" };

  const igIdentity = `instagram:${senderIgId}`;
  const { data: contato } = await db
    .from("contacts")
    .select("id, phone_number, custom_fields")
    .eq("organization_id", orgId)
    .eq("social_identity", igIdentity)
    .maybeSingle();

  if (!contato) return { status: "skipped", detail: "nao_eh_lead_captacao" };

  const cf = (contato.custom_fields as Record<string, unknown>) ?? {};
  const estagio = typeof cf.captacao_estagio === "string" ? cf.captacao_estagio : null;
  if (!estagio) return { status: "skipped", detail: "sem_estagio" };

  const emitir = (t: string | null) =>
    emitirDm(db, orgId, channelSessionId, senderIgId, contato.id, t);

  // ── Etapa CIDADE: aguardando a localização ───────────────────────────────
  if ((estagio === "interagiu" || estagio === "em_conversa") && !cf.cidade) {
    const loc = await extrairLocalidade(db, orgId, texto, config);
    if (!loc.cidade && !loc.uf) {
      await emitir(config.textoDmPesquisa);
      return { status: "ok", detail: "cidade_nao_entendida_reperguntou" };
    }

    const noAlvo = estaNoAlvo(config, loc.cidade, loc.uf);
    const base = { ...cf, cidade: loc.cidade, uf: loc.uf };

    if (noAlvo) {
      await db
        .from("contacts")
        .update({ custom_fields: { ...base, captacao_estagio: "qualificado_mgbh" } })
        .eq("id", contato.id)
        .eq("organization_id", orgId);
      await emitir(config.textoDmWhatsapp);
      return { status: "ok", detail: "qualificado_pediu_whatsapp" };
    }

    await db
      .from("contacts")
      .update({ custom_fields: { ...base, captacao_estagio: "fora_de_alvo" } })
      .eq("id", contato.id)
      .eq("organization_id", orgId);
    await emitir(config.textoDmEntrega); // entrega a isca mesmo fora do alvo (goodwill)
    return { status: "ok", detail: "fora_de_alvo_entregou_isca" };
  }

  // ── Etapa WHATSAPP: qualificado, aguardando o número ─────────────────────
  if (estagio === "qualificado_mgbh" && !cf.whatsapp) {
    const fone = extrairTelefone(texto);
    if (!fone) {
      await emitir(config.textoDmWhatsapp);
      return { status: "ok", detail: "telefone_nao_entendido_reperguntou" };
    }

    const cidade = (cf.cidade as string) ?? null;
    const uf = (cf.uf as string) ?? null;

    // UMA escrita só do custom_fields (inclui endereco_gip pra inteligência
    // territorial) — evita 2ª escrita correndo com esta. Checa o erro: o
    // phone_number tem CHECK E.164 e unique por org.
    const { error: updErr } = await db
      .from("contacts")
      .update({
        phone_number: contato.phone_number ?? fone,
        custom_fields: {
          ...cf,
          whatsapp: fone,
          consentimento: true,
          consentimento_em: new Date().toISOString(),
          captacao_estagio: "apoiador_whatsapp",
          endereco_gip: { ...((cf.endereco_gip as Record<string, unknown>) ?? {}), cidade, uf },
          origem_captacao: "instagram",
        },
      })
      .eq("id", contato.id)
      .eq("organization_id", orgId);

    if (updErr) {
      // Telefone já existe em outro contato (unique) ou formato inesperado:
      // grava só o custom_fields (sem phone_number) pra não perder a captação.
      logger.warn("[captacao-qualificacao] update com phone falhou, salvando sem phone", {
        error: updErr.message,
      });
      await db
        .from("contacts")
        .update({
          custom_fields: {
            ...cf,
            whatsapp: fone,
            consentimento: true,
            consentimento_em: new Date().toISOString(),
            captacao_estagio: "apoiador_whatsapp",
            endereco_gip: { ...((cf.endereco_gip as Record<string, unknown>) ?? {}), cidade, uf },
            origem_captacao: "instagram",
          },
        })
        .eq("id", contato.id)
        .eq("organization_id", orgId);
    }

    await emitir(config.textoDmEntrega);
    await graduar(db, orgId, contato.id); // só cria o pol_lead
    return { status: "ok", detail: "apoiador_graduado" };
  }

  return { status: "skipped", detail: "estagio_sem_acao" };
}

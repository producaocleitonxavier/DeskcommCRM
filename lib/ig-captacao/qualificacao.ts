/**
 * Cérebro da qualificação por DM do funil de captação do Instagram (peça 2).
 *
 * Máquina de estados dirigida pelo ESTÁGIO do lead (custom_fields.captacao_estagio),
 * sem flag separada: o próprio estágio diz o que a próxima resposta significa.
 *
 *   interagiu/em_conversa (sem cidade)  → a resposta traz ESTADO/CIDADE/BAIRRO (+ talvez WhatsApp)
 *   qualificado_mgbh (sem whatsapp)     → a resposta é o WHATSAPP
 *
 * A mensagem de captação pede os 4 dados de uma vez (estado, cidade, bairro,
 * WhatsApp). Extraímos TUDO que vier na mesma resposta; se faltar, reperguntamos
 * só o que faltou. Quando chega a cidade:
 *   - no alvo (estaNoAlvo)  → se já veio o WhatsApp, finaliza na hora; senão pede
 *                             o WhatsApp (estágio "qualificado_mgbh").
 *   - fora do alvo          → entrega a isca (goodwill), guarda o que veio.
 * Finalizar = grava telefone + consentimento + endereco_gip (estado/cidade/bairro)
 * → "apoiador_whatsapp" → entrega a isca → GRADUA pro funil (pol_leads simpatizante).
 *
 * NUNCA faz HTTP: as DMs de saída saem como `ig.dm_outbound` no event_log.
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
  bairro: string | null;
}

/** Heurística (cidades do alvo mencionadas direto) + IA leve pra texto livre. */
async function extrairLocalidade(
  db: SupabaseClient,
  orgId: string,
  texto: string,
  config: CaptacaoConfig,
): Promise<Localidade> {
  const t = norm(texto);

  // 1) Heurística: a pessoa escreveu o nome de uma cidade do alvo (cidade + UF só;
  //    o bairro vem da IA, que entende "bairro tal").
  const doAlvo = [config.cidadeAlvo, ...config.cidadesExtra].filter(Boolean) as string[];
  let heurCidade: string | null = null;
  let heurUf: string | null = null;
  for (const c of doAlvo) {
    if (t.includes(norm(c))) {
      heurCidade = c;
      heurUf = config.estadoAlvo;
      break;
    }
  }

  // 2) IA leve: extrai cidade/UF/BAIRRO de uma frase curta.
  try {
    const cerebro = await cerebroDaOrg(db, orgId);
    const { text } = await generateText({
      model: modeloDoCerebro(cerebro),
      system:
        'Extraia a CIDADE, a UF (sigla de 2 letras) e o BAIRRO que a pessoa diz morar ou ser, a partir de uma mensagem curta em português do Brasil. Entenda apelidos (ex.: "BH" = Belo Horizonte/MG). Ignore número de telefone. Responda SOMENTE um JSON {"cidade": "<nome>"|null, "uf": "<XX>"|null, "bairro": "<nome>"|null}. Nada fora do JSON.',
      prompt: texto.slice(0, 280),
      maxOutputTokens: 80,
    });
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]) as { cidade?: unknown; uf?: unknown; bairro?: unknown };
      const iaCidade = typeof j.cidade === "string" && j.cidade.trim() ? j.cidade.trim() : null;
      const iaUf = typeof j.uf === "string" && j.uf.trim() ? j.uf.trim().toUpperCase().slice(0, 2) : null;
      const iaBairro = typeof j.bairro === "string" && j.bairro.trim() ? j.bairro.trim() : null;
      // A heurística ganha na cidade/UF (match exato do alvo); a IA complementa o bairro.
      return {
        cidade: heurCidade ?? iaCidade,
        uf: heurUf ?? iaUf,
        bairro: iaBairro,
      };
    }
  } catch (err) {
    logger.warn("[captacao-qualificacao] extrairLocalidade IA falhou", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return { cidade: heurCidade, uf: heurUf, bairro: null };
}

/**
 * Extrai um telefone BR do texto. DDD é OBRIGATÓRIO. Devolve:
 *  - { fone }   → E.164 (+55DDDNUMERO)
 *  - "sem_ddd"  → número (8-9 dígitos) SEM DDD → repetir pedindo DDD
 *  - "invalido" → não parece telefone
 */
type ResultadoTelefone = { fone: string } | "sem_ddd" | "invalido";

function extrairTelefone(texto: string): ResultadoTelefone {
  let d = texto.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); // tira o 55 se veio
  if (d.length === 10 || d.length === 11) return { fone: `+55${d}` }; // DDD + número
  if (d.length === 8 || d.length === 9) return "sem_ddd"; // número sem DDD
  return "invalido";
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

/** Cria o lead político (graduação) — SÓ quando qualificado. Idempotente. */
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
 * Finaliza o apoiador: grava telefone + consentimento + endereco_gip
 * (estado/cidade/bairro), entrega a isca e GRADUA. Uma escrita só do
 * custom_fields pra não correr com outra. Fallback sem phone se o unique/CHECK
 * do telefone recusar (não perde a captação).
 */
async function finalizarApoiador(
  db: SupabaseClient,
  orgId: string,
  contato: { id: string; phone_number: string | null },
  cf: Record<string, unknown>,
  fone: string,
  entregaDm: string | null,
  emitir: (t: string | null) => Promise<void>,
): Promise<void> {
  const enderecoGip = {
    ...((cf.endereco_gip as Record<string, unknown>) ?? {}),
    cidade: (cf.cidade as string) ?? null,
    uf: (cf.uf as string) ?? null,
    bairro: (cf.bairro as string) ?? null,
  };
  const novoCf = {
    ...cf,
    whatsapp: fone,
    consentimento: true,
    consentimento_em: new Date().toISOString(),
    captacao_estagio: "apoiador_whatsapp",
    endereco_gip: enderecoGip,
    origem_captacao: "instagram",
  };

  const { error: updErr } = await db
    .from("contacts")
    .update({ phone_number: contato.phone_number ?? fone, custom_fields: novoCf })
    .eq("id", contato.id)
    .eq("organization_id", orgId);

  if (updErr) {
    logger.warn("[captacao-qualificacao] update com phone falhou, salvando sem phone", {
      error: updErr.message,
    });
    await db
      .from("contacts")
      .update({ custom_fields: novoCf })
      .eq("id", contato.id)
      .eq("organization_id", orgId);
  }

  await emitir(entregaDm);
  await graduar(db, orgId, contato.id);
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

  // ── Etapa LOCALIZAÇÃO: aguardando estado/cidade/bairro (+ talvez WhatsApp) ──
  if ((estagio === "interagiu" || estagio === "em_conversa") && !cf.cidade) {
    const loc = await extrairLocalidade(db, orgId, texto, config);
    const tel = extrairTelefone(texto); // a pessoa pode ter mandado tudo junto

    if (!loc.cidade && !loc.uf) {
      // Não entendeu a localização — repergunta (mantém o que já sabe do telefone).
      await emitir(config.textoDmPesquisa);
      return { status: "ok", detail: "cidade_nao_entendida_reperguntou" };
    }

    const noAlvo = estaNoAlvo(config, loc.cidade, loc.uf);
    const base = { ...cf, cidade: loc.cidade, uf: loc.uf, bairro: loc.bairro ?? (cf.bairro ?? null) };

    if (noAlvo) {
      // No alvo: se o WhatsApp veio junto, finaliza agora; senão, pede o WhatsApp.
      if (typeof tel === "object") {
        await finalizarApoiador(db, orgId, contato, base, tel.fone, config.textoDmEntrega, emitir);
        return { status: "ok", detail: "apoiador_graduado_tacada_unica" };
      }
      await db
        .from("contacts")
        .update({ custom_fields: { ...base, captacao_estagio: "qualificado_mgbh" } })
        .eq("id", contato.id)
        .eq("organization_id", orgId);
      await emitir(config.textoDmWhatsapp);
      return { status: "ok", detail: "qualificado_pediu_whatsapp" };
    }

    // Fora do alvo: entrega a isca (goodwill) e guarda o que veio (inclusive WhatsApp).
    await db
      .from("contacts")
      .update({
        custom_fields: {
          ...base,
          captacao_estagio: "fora_de_alvo",
          ...(typeof tel === "object" ? { whatsapp: tel.fone } : {}),
        },
      })
      .eq("id", contato.id)
      .eq("organization_id", orgId);
    await emitir(config.textoDmEntrega);
    return { status: "ok", detail: "fora_de_alvo_entregou_isca" };
  }

  // ── Etapa WHATSAPP: qualificado, aguardando o número ─────────────────────
  if (estagio === "qualificado_mgbh" && !cf.whatsapp) {
    const tel = extrairTelefone(texto);
    if (tel === "sem_ddd") {
      await emitir("Quase! 📱 Preciso do DDD também. Me manda assim: (31) 99999-9999");
      return { status: "ok", detail: "sem_ddd_reperguntou" };
    }
    if (tel === "invalido") {
      await emitir(config.textoDmWhatsapp);
      return { status: "ok", detail: "telefone_nao_entendido_reperguntou" };
    }
    await finalizarApoiador(db, orgId, contato, cf, tel.fone, config.textoDmEntrega, emitir);
    return { status: "ok", detail: "apoiador_graduado" };
  }

  return { status: "skipped", detail: "estagio_sem_acao" };
}

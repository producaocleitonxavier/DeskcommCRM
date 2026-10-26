/**
 * ÍNDICE DE ENGAJAMENTO — o motor do funil automático.
 *
 * O funil se move SOZINHO por SINAIS REAIS, ponderados: resposta pesa mais que
 * recebimento passivo. O índice (guardado em `pol_leads.political_score`, que a
 * UI já mostra como "Score") é COMPUTADO dos fatos — não incrementado — então
 * recalcular é idempotente e nunca drifta.
 *
 * ═══ Pesos (team, 2026-10-26) ═══
 *   recebeu material           +1  (passivo — fomos nós)
 *   respondeu a um disparo      +5  (recíproco — ELE agiu; 1 resposta = simpatizante)
 *   cadastrou no QR (confirmou) +6
 *   consentiu continuar          +10
 *   (indicou quem se cadastrou  +10/pessoa — Fase 2)
 *
 * ═══ Estágio por índice (SÓ AVANÇA, nunca rebaixa) ═══
 *   simpatizante ≥5 · apoiador ≥20 · militante ≥50 · voto_certo = eleição (manual)
 *
 * ═══ Temperatura ═══
 *   Aqui ela só AQUECE (sinal é de engajamento). O ESFRIAMENTO por inatividade é
 *   do job diário — temperatura reflete o AGORA.
 *
 * FAIL-SOFT: nunca lança (o chamador é handler de evento).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

const ORDEM_ESTAGIO = ["novo_cadastro", "simpatizante", "apoiador", "militante", "voto_certo"] as const;
const ORDEM_TEMP = ["frio", "morno", "quente"] as const;

const PESO = { material: 1, respostaDisparo: 5, qrCadastro: 6, consentiu: 10, indicado: 10 } as const;
/** Teto de respostas pontuadas — evita que responder 50x infle o índice. */
const TETO_RESPOSTAS = 5;
/** Trouxe esta quantidade de gente = Multiplicador/Militante, direto. */
const INDICADOS_PARA_MILITANTE = 3;

const LIMIAR_ESTAGIO: Array<[number, (typeof ORDEM_ESTAGIO)[number]]> = [
  [50, "militante"],
  [20, "apoiador"],
  [5, "simpatizante"],
];

function estagioPorScore(score: number): (typeof ORDEM_ESTAGIO)[number] {
  for (const [min, estagio] of LIMIAR_ESTAGIO) if (score >= min) return estagio;
  return "novo_cadastro";
}

/** Temperatura-alvo pelo índice + recência. `dias` null = sem atividade conhecida. */
function tempPorRecencia(score: number, dias: number | null): (typeof ORDEM_TEMP)[number] {
  if (dias == null) return score > 0 ? "morno" : "frio";
  if (dias <= 15 && score >= 20) return "quente";
  if (dias <= 60) return "morno";
  return "frio";
}

function ordem<T extends readonly string[]>(arr: T, v: string | null | undefined): number {
  const i = arr.indexOf((v ?? "") as never);
  return i < 0 ? 0 : i;
}

export interface EngajamentoResultado {
  temLead: boolean;
  score: number;
  estagio: string;
  avancou: boolean;
}

const NADA: EngajamentoResultado = { temLead: false, score: 0, estagio: "novo_cadastro", avancou: false };

/**
 * Recalcula o índice de engajamento do contato dos FATOS, avança o estágio
 * (forward-only, gravando a transição como SISTEMA) e aquece a temperatura.
 */
export async function recomputarEngajamento(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  opts: { reason?: string; engajouAgora?: boolean } = {},
): Promise<EngajamentoResultado> {
  try {
    const { data: leadRow } = await admin
      .from("pol_leads")
      .select("id, support_level, temperature, consent_at")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!leadRow) return NADA;
    const lead = leadRow as { id: string; support_level: string; temperature: string | null; consent_at: string | null };

    // ── Conta os sinais (idempotente: são fatos no banco) ──
    const [matCamp, matQr, respDisparo, qrConfirmado, indicadosQ, contato] = await Promise.all([
      admin.from("campaign_recipients").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("contact_id", contactId).not("material_entregue_at", "is", null),
      admin.from("pol_qr_cadastros").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("contact_id", contactId).not("material_entregue_at", "is", null),
      admin.from("campaign_recipients").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("contact_id", contactId).not("replied_at", "is", null),
      admin.from("pol_qr_cadastros").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("contact_id", contactId).not("nome_informado", "is", null),
      admin.from("pol_indicacoes").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("indicador_contact_id", contactId),
      admin.from("contacts").select("last_activity_at").eq("id", contactId).maybeSingle(),
    ]);

    const materiais = (matCamp.count ?? 0) + (matQr.count ?? 0);
    const respostas = Math.min(respDisparo.count ?? 0, TETO_RESPOSTAS);
    const cadastrouQr = (qrConfirmado.count ?? 0) > 0 ? 1 : 0;
    const consentiu = lead.consent_at ? 1 : 0;
    const indicados = indicadosQ.count ?? 0; // pessoas que ELA trouxe

    const score =
      materiais * PESO.material +
      respostas * PESO.respostaDisparo +
      cadastrouQr * PESO.qrCadastro +
      consentiu * PESO.consentiu +
      indicados * PESO.indicado;

    const ultimaAtividade = (contato.data as { last_activity_at: string | null } | null)?.last_activity_at ?? null;
    const dias = ultimaAtividade
      ? Math.floor((Date.now() - new Date(ultimaAtividade).getTime()) / 86_400_000)
      : score > 0 ? 0 : null;

    let alvoEstagio = estagioPorScore(score);
    let alvoTemp = tempPorRecencia(score, dias);
    // Trouxe gente de verdade = Multiplicador/Militante, direto (o ouro do funil).
    if (indicados >= INDICADOS_PARA_MILITANTE && ordem(ORDEM_ESTAGIO, alvoEstagio) < ordem(ORDEM_ESTAGIO, "militante")) {
      alvoEstagio = "militante";
    }
    // Engajar AGORA (qualquer resposta de entrada) garante o piso simpatizante/
    // morno, mesmo que o índice ainda não tenha cruzado 5 — responder já é sinal.
    if (opts.engajouAgora) {
      if (ordem(ORDEM_ESTAGIO, alvoEstagio) < ordem(ORDEM_ESTAGIO, "simpatizante")) alvoEstagio = "simpatizante";
      if (ordem(ORDEM_TEMP, alvoTemp) < ordem(ORDEM_TEMP, "morno")) alvoTemp = "morno";
    }

    // ── Estágio: só avança ──
    let avancou = false;
    if (ordem(ORDEM_ESTAGIO, alvoEstagio) > ordem(ORDEM_ESTAGIO, lead.support_level)) {
      const { error: errT } = await admin.from("pol_funnel_transitions").insert({
        organization_id: organizationId,
        contact_id: contactId,
        from_stage: lead.support_level,
        to_stage: alvoEstagio,
        changed_by: null,
        reason: opts.reason ?? `Índice de engajamento ${score}`,
      });
      if (!errT) {
        const { data: upd } = await admin
          .from("pol_leads")
          .update({ support_level: alvoEstagio })
          .eq("id", lead.id)
          .eq("support_level", lead.support_level)
          .select("id")
          .maybeSingle();
        avancou = !!upd;
      }
    }

    // ── Temperatura: aqui só aquece (esfriamento é do job diário) ──
    const tempAtual = (lead.temperature ?? "frio") as (typeof ORDEM_TEMP)[number];
    const novaTemp = ORDEM_TEMP[Math.max(ordem(ORDEM_TEMP, tempAtual), ordem(ORDEM_TEMP, alvoTemp))]!;

    await admin
      .from("pol_leads")
      .update({ political_score: score, temperature: novaTemp })
      .eq("id", lead.id);

    return { temLead: true, score, estagio: avancou ? alvoEstagio : lead.support_level, avancou };
  } catch (err) {
    logger.warn("engajamento: recompute falhou (a conversa segue normal)", {
      organization_id: organizationId,
      contact_id: contactId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return NADA;
  }
}

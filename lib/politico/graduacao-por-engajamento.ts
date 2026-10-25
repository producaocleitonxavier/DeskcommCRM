/**
 * GRADUAÇÃO POR ENGAJAMENTO — a resposta move o funil político.
 *
 * ═══ O que isto faz ═══
 *
 * Quando um contato que é lead político RESPONDE (qualquer mensagem de ENTRADA —
 * resposta a um disparo, ou o inbound do QR "me cadastrei e quero receber"), ele
 * deixou de ser um nome numa planilha e virou uma conversa. O funil reflete isso:
 * `novo_cadastro → simpatizante`. É o "avanço de estágio" que se valida no teste
 * de disparo, e é o motor do **Termômetro de Base**: a temperatura sobe por
 * SINAL REAL (a pessoa falou com a gente), não por palpite de quem cadastrou.
 *
 * ═══ A regra, e por que ela PARA no simpatizante ═══
 *
 * Só promove `novo_cadastro → simpatizante`, um degrau, na PRIMEIRA interação.
 * Apoiador, militante e voto certo exigem sinal mais forte (presença, doação,
 * mobilização) ou decisão humana — responder a um WhatsApp não faz ninguém
 * militante. Promover além daqui inflaria o funil e mentiria para o estrategista.
 *
 * ═══ Idempotente de propósito ═══
 *
 * O UPDATE casa SÓ `support_level='novo_cadastro'`. Quem já é simpatizante (ou
 * mais) não casa o filtro: responder dez vezes não gradua dez vezes. É o que
 * permite ligar isto num handler que roda a cada mensagem recebida.
 *
 * Espelha o caminho canônico de `POST /api/v1/pol-leads/funnel` (valida nível
 * atual → grava `pol_funnel_transitions` → atualiza `support_level`), mas o autor
 * é o SISTEMA (`changed_by = null`), não um usuário.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export interface GraduacaoResultado {
  /** Havia lead político para este contato? (não → org não-política ou contato sem lead) */
  temLead: boolean;
  /** Subiu de estágio nesta chamada? */
  graduou: boolean;
  /** Aqueceu a temperatura (frio → morno) nesta chamada? */
  aqueceu: boolean;
}

const NADA: GraduacaoResultado = { temLead: false, graduou: false, aqueceu: false };

/**
 * Gradua o lead do contato por engajamento. FAIL-SOFT: devolve o resultado
 * parcial e registra o aviso; nunca lança (o chamador é um handler de evento que
 * não pode derrubar o drain por causa de bookkeeping de funil).
 */
export async function graduarPorEngajamento(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  opts: { reason?: string } = {},
): Promise<GraduacaoResultado> {
  try {
    const { data: lead } = await admin
      .from("pol_leads")
      .select("id, support_level, temperature")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .maybeSingle();

    if (!lead) return NADA;
    const l = lead as { id: string; support_level: string; temperature: string | null };

    const resultado: GraduacaoResultado = { temLead: true, graduou: false, aqueceu: false };

    // 1) Degrau do funil: só na primeira interação (novo_cadastro → simpatizante).
    if (l.support_level === "novo_cadastro") {
      const { error: errTransicao } = await admin.from("pol_funnel_transitions").insert({
        organization_id: organizationId,
        contact_id: contactId,
        from_stage: "novo_cadastro",
        to_stage: "simpatizante",
        changed_by: null, // sistema
        reason: opts.reason ?? "Engajou no WhatsApp",
      });
      if (errTransicao) {
        logger.warn("graduacao: transição não gravada (nível não muda)", {
          organization_id: organizationId,
          contact_id: contactId,
          detail: errTransicao.message.slice(0, 160),
        });
      } else {
        // O UPDATE casa o nível atual: se outra graduação correu junto, não
        // regride nem pula — a corrida perde em silêncio, sem transição órfã.
        const { data: upd } = await admin
          .from("pol_leads")
          .update({ support_level: "simpatizante" })
          .eq("id", l.id)
          .eq("organization_id", organizationId)
          .eq("support_level", "novo_cadastro")
          .select("id")
          .maybeSingle();
        resultado.graduou = !!upd;
      }
    }

    // 2) Temperatura: engajar tira do frio (frio → morno). Morno → quente pede
    //    sinal mais forte (recorrência, presença) — fica para o Termômetro de Base.
    if (l.temperature === "frio" || l.temperature == null) {
      const { data: aq } = await admin
        .from("pol_leads")
        .update({ temperature: "morno" })
        .eq("id", l.id)
        .eq("organization_id", organizationId)
        .or("temperature.eq.frio,temperature.is.null")
        .select("id")
        .maybeSingle();
      resultado.aqueceu = !!aq;
    }

    return resultado;
  } catch (err) {
    logger.warn("graduacao: falhou (a conversa segue normal)", {
      organization_id: organizationId,
      contact_id: contactId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return NADA;
  }
}

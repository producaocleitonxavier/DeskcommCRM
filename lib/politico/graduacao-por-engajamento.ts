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

import { recomputarEngajamento } from "@/lib/politico/engajamento";

export interface GraduacaoResultado {
  /** Havia lead político para este contato? (não → org não-política ou contato sem lead) */
  temLead: boolean;
  /** Subiu de estágio nesta chamada? */
  graduou: boolean;
  /** Aqueceu a temperatura nesta chamada? (mantido por compatibilidade) */
  aqueceu: boolean;
}

/**
 * Gradua o lead por engajamento — agora pelo ÍNDICE DE ENGAJAMENTO
 * (`lib/politico/engajamento.ts`), não mais por um degrau fixo. Toda resposta de
 * entrada recalcula o índice dos fatos (resposta pesa +5, material +1, etc.),
 * avança o estágio (forward-only) e aquece a temperatura. `engajouAgora` garante
 * o piso simpatizante/morno. FAIL-SOFT: recomputarEngajamento nunca lança.
 */
export async function graduarPorEngajamento(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  opts: { reason?: string } = {},
): Promise<GraduacaoResultado> {
  const r = await recomputarEngajamento(admin, organizationId, contactId, {
    reason: opts.reason ?? "Engajou no WhatsApp",
    engajouAgora: true,
  });
  return { temLead: r.temLead, graduou: r.avancou, aqueceu: r.avancou };
}

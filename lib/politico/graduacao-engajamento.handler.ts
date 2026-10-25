/**
 * Adapter fino que pluga a GRADUAÇÃO POR ENGAJAMENTO no dispatcher do
 * `event_log` — mesmo padrão de `lib/campanhas/resposta.handler.ts`.
 *
 * Consome `message.received` (emitido pelo TRIGGER de `messages`, qualquer canal
 * de entrada). Quando quem respondeu é lead político, sobe o funil
 * `novo_cadastro → simpatizante` e aquece a temperatura. Vale tanto para a
 * resposta a um disparo quanto para o inbound do QR ("me cadastrei e quero
 * receber"): os dois são a mesma coisa — a pessoa falou com a gente.
 *
 * GATE automático: `graduarPorEngajamento` devolve `temLead:false` quando não há
 * `pol_leads` para o contato (org não-política ou contato sem lead). Nesse caso o
 * handler reporta `skipped` — nenhum escrita, nenhum custo.
 *
 * Nunca lança: falha vira `error` para o dispatcher, que aplica o backoff dele. A
 * conversa já está no inbox — o que se perde numa falha é o avanço do funil, não
 * a mensagem.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { graduarPorEngajamento } from "@/lib/politico/graduacao-por-engajamento";
import { createAdminClient } from "@/lib/supabase/admin";

export const POL_GRADUACAO_ENGAJAMENTO_HANDLER_KEY = "pol-graduacao-engajamento.v1";

export const polGraduacaoEngajamentoHandler: EventHandler = {
  key: POL_GRADUACAO_ENGAJAMENTO_HANDLER_KEY,
  // Mover o funil é bookkeeping interno (não envia nada), então roda mesmo com a
  // org pausada — espelha o handler de resposta de campanha.
  naOrgParada: "roda",
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    if (!contactId) {
      return {
        consumer_key: POL_GRADUACAO_ENGAJAMENTO_HANDLER_KEY,
        status: "skipped",
        detail: "evento sem contact_id",
      };
    }

    try {
      const r = await graduarPorEngajamento(createAdminClient(), row.organization_id, contactId, {
        reason: "Engajou no WhatsApp",
      });
      if (!r.temLead) {
        return {
          consumer_key: POL_GRADUACAO_ENGAJAMENTO_HANDLER_KEY,
          status: "skipped",
          detail: "sem lead político",
        };
      }
      return {
        consumer_key: POL_GRADUACAO_ENGAJAMENTO_HANDLER_KEY,
        status: r.graduou || r.aqueceu ? "ok" : "skipped",
        detail: `graduou=${r.graduou} aqueceu=${r.aqueceu}`,
      };
    } catch (err) {
      return {
        consumer_key: POL_GRADUACAO_ENGAJAMENTO_HANDLER_KEY,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

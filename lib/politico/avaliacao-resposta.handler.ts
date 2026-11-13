/**
 * Handler da NOTA DO CIDADÃO no dispatcher do `event_log` — mesmo padrão do
 * aceite do divulgador. Consome `message.received`; só age quando a mensagem É
 * uma nota (1 a 5) E o contato tem uma avaliação pedida e sem resposta. No caso
 * comum (conversa normal) é no-op.
 *
 * `naOrgParada: "pula"`: o agradecimento é mensagem que sai — numa organização
 * pausada não deve sair.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { registrarNotaPorResposta } from "@/lib/politico/avaliacao";
import { lerNotaDaResposta } from "@/lib/politico/avaliacao-texto";
import { createAdminClient } from "@/lib/supabase/admin";

export const POL_AVALIACAO_RESPOSTA_HANDLER_KEY = "pol-avaliacao-resposta.v1";

export const polAvaliacaoRespostaHandler: EventHandler = {
  key: POL_AVALIACAO_RESPOSTA_HANDLER_KEY,
  naOrgParada: "pula",
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const K = POL_AVALIACAO_RESPOSTA_HANDLER_KEY;
    const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    if (!contactId) return { consumer_key: K, status: "skipped", detail: "sem contact_id" };

    const messageId =
      (typeof row.payload.message_id === "string" ? row.payload.message_id : null) ??
      (typeof row.entity_id === "string" ? row.entity_id : null);
    if (!messageId) return { consumer_key: K, status: "skipped", detail: "sem mensagem" };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("messages")
      .select("body, direction, channel_session_id, conversation_id, created_at")
      .eq("organization_id", row.organization_id)
      .eq("id", messageId)
      .maybeSingle();
    if (error) return { consumer_key: K, status: "error", detail: `ler mensagem: ${error.message}` };
    const m = data as { body: string | null; direction: string | null; channel_session_id: string | null; conversation_id: string | null; created_at: string | null } | null;
    if (!m || m.direction !== "inbound") return { consumer_key: K, status: "skipped", detail: "não é inbound" };
    // Corta cedo: a imensa maioria das mensagens não é uma nota.
    if (lerNotaDaResposta(m.body) === null) return { consumer_key: K, status: "skipped", detail: "não é nota" };

    const r = await registrarNotaPorResposta(admin, {
      organizationId: row.organization_id,
      contactId,
      texto: m.body,
      canalId: m.channel_session_id,
      conversationId: m.conversation_id,
      recebidaEm: m.created_at,
    });
    return { consumer_key: K, status: r.status, detail: r.detail };
  },
};

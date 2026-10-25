/**
 * Entrega automática do EBOOK na resposta — handler no dispatcher do event_log.
 *
 * Consome `message.received`. Quando a pessoa responde SIM a um disparo que tem
 * material vinculado, entrega o material como anexo (`entregar-material.ts`), sem
 * repassar ao gabinete. Gated pela própria lógica: sem disparo pendente com
 * material, ou resposta não-afirmativa, é no-op.
 *
 * Roda DEPOIS da atribuição de resposta da campanha (mesmo evento), então o
 * `replied_at` já está carimbado quando a entrega olha o destinatário.
 *
 * Nunca lança: falha vira `error` para o dispatcher (backoff). A conversa já
 * está no inbox; o que se perde numa falha é a entrega automática — o retry de
 * 24h e o atendimento humano cobrem.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { entregarMaterialNaResposta } from "@/lib/politico/entregar-material";
import { createAdminClient } from "@/lib/supabase/admin";

export const POL_EBOOK_RESPOSTA_HANDLER_KEY = "pol-ebook-na-resposta.v1";

export const polEbookNaRespostaHandler: EventHandler = {
  key: POL_EBOOK_RESPOSTA_HANDLER_KEY,
  // Entregar o material é proativo (envia), mas só para quem PEDIU respondendo —
  // é atendimento receptivo, não disparo. Numa org pausada não deve sair, então
  // "pula" (ao contrário da graduação, que é bookkeeping interno).
  naOrgParada: "pula",
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    if (!contactId) {
      return { consumer_key: POL_EBOOK_RESPOSTA_HANDLER_KEY, status: "skipped", detail: "sem contact_id" };
    }

    const admin = createAdminClient();
    // O texto da resposta: a mensagem que disparou o evento (payload.message_id
    // ou entity_id). Sem ela não há como saber se foi SIM.
    const messageId =
      (typeof row.payload.message_id === "string" ? row.payload.message_id : null) ??
      (typeof row.entity_id === "string" ? row.entity_id : null);
    let texto: string | null = null;
    if (messageId) {
      const { data } = await admin
        .from("messages")
        .select("body, direction")
        .eq("organization_id", row.organization_id)
        .eq("id", messageId)
        .maybeSingle();
      const m = data as { body: string | null; direction: string | null } | null;
      // Só mensagem de ENTRADA conta como resposta da pessoa.
      if (m && m.direction === "inbound") texto = m.body;
    }

    try {
      const r = await entregarMaterialNaResposta(admin, {
        organizationId: row.organization_id,
        contactId,
        texto,
      });
      return {
        consumer_key: POL_EBOOK_RESPOSTA_HANDLER_KEY,
        status: r.entregou ? "ok" : "skipped",
        detail: r.entregou ? `entregue: ${r.materialTitulo ?? "material"}` : (r.motivo ?? "sem entrega"),
      };
    } catch (err) {
      return {
        consumer_key: POL_EBOOK_RESPOSTA_HANDLER_KEY,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

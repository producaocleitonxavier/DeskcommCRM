/**
 * Handler do CADASTRO POR QR no dispatcher do `event_log` — mesmo padrão do
 * ebook-na-resposta. Consome `message.received`; só age quando o texto traz um
 * `[qr:CODE]` de uma origem ativa. Sem marcador, é no-op (o caso comum).
 *
 * `naOrgParada: "pula"`: entregar o ebook é proativo (sai mensagem), então numa
 * org pausada não deve sair — igual à entrega do disparo.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { processarCadastroQr } from "@/lib/politico/qr-cadastro";
import { createAdminClient } from "@/lib/supabase/admin";

export const POL_QR_CADASTRO_HANDLER_KEY = "pol-qr-cadastro.v1";

export const polQrCadastroHandler: EventHandler = {
  key: POL_QR_CADASTRO_HANDLER_KEY,
  naOrgParada: "pula",
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    if (!contactId) {
      return { consumer_key: POL_QR_CADASTRO_HANDLER_KEY, status: "skipped", detail: "sem contact_id" };
    }

    const admin = createAdminClient();
    // O texto da mensagem que disparou o evento — só entrada conta.
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
      if (m && m.direction === "inbound") texto = m.body;
    }

    const r = await processarCadastroQr(admin, {
      organizationId: row.organization_id,
      contactId,
      texto,
    });
    return { consumer_key: POL_QR_CADASTRO_HANDLER_KEY, status: r.status, detail: r.detail };
  },
};

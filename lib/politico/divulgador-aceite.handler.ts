/**
 * Handler do ACEITE DO DIVULGADOR no dispatcher do `event_log` — mesmo padrão do
 * cadastro por QR. Consome `message.received`; só age quando QUEM mandou foi
 * convidado (tag `divulgador_convidado`). Sem convite pendente, é no-op (o caso
 * comum). Afirmativo → vira multiplicador; negativo → recusou.
 *
 * `naOrgParada: "pula"`: a confirmação do aceite é proativa (sai mensagem), então
 * numa org pausada não deve sair — igual à entrega do QR.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { processarAceiteDivulgador } from "@/lib/politico/divulgador";
import { createAdminClient } from "@/lib/supabase/admin";

export const POL_DIVULGADOR_ACEITE_HANDLER_KEY = "pol-divulgador-aceite.v1";

export const polDivulgadorAceiteHandler: EventHandler = {
  key: POL_DIVULGADOR_ACEITE_HANDLER_KEY,
  naOrgParada: "pula",
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const contactId = typeof row.payload.contact_id === "string" ? row.payload.contact_id : null;
    if (!contactId) {
      return { consumer_key: POL_DIVULGADOR_ACEITE_HANDLER_KEY, status: "skipped", detail: "sem contact_id" };
    }

    const admin = createAdminClient();
    const messageId =
      (typeof row.payload.message_id === "string" ? row.payload.message_id : null) ??
      (typeof row.entity_id === "string" ? row.entity_id : null);
    let texto: string | null = null;
    let canalId: string | null = null;
    if (messageId) {
      const { data } = await admin
        .from("messages")
        .select("body, direction, channel_session_id")
        .eq("organization_id", row.organization_id)
        .eq("id", messageId)
        .maybeSingle();
      const m = data as { body: string | null; direction: string | null; channel_session_id: string | null } | null;
      if (m && m.direction === "inbound") {
        texto = m.body;
        canalId = m.channel_session_id;
      }
    }

    const r = await processarAceiteDivulgador(admin, {
      organizationId: row.organization_id,
      contactId,
      texto,
      canalId,
    });
    return { consumer_key: POL_DIVULGADOR_ACEITE_HANDLER_KEY, status: r.status, detail: r.detail };
  },
};

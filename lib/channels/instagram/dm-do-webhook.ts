/**
 * Extrai as DMs RECEBIDAS de um payload de webhook do Instagram — PURO.
 *
 * Por que existe: o endereço de webhook que a tela entrega ao gabinete
 * (`/api/v1/webhooks/instagram-comments/<token>`) só lia COMENTÁRIOS. Um app da
 * Meta aponta para UM endereço só; com ele configurado, a resposta da pessoa no
 * Direct (cidade, bairro, WhatsApp) nunca chegava, e a captação parava depois do
 * primeiro passo. Agora o mesmo endereço entende também o campo `messages`.
 *
 * Fica de fora: mensagem sem conteúdo (leitura, reação) e ECO — a mensagem que a
 * própria conta enviou volta no webhook com `is_echo` ou com o remetente igual ao
 * dono da entrada; tratá-la como recebida faria a automação responder a si mesma.
 */

export interface DmRecebida {
  /** Conta do Instagram que recebeu (o `entry.id`). */
  igAccountId: string;
  senderId: string;
  recipientId: string;
  messageId: string;
  text: string | null;
  attachments: { type: string; payload: { url?: string } }[];
  timestamp: number | null;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function extrairDmsRecebidas(payload: unknown): DmRecebida[] {
  if (!ehObjeto(payload) || !Array.isArray(payload.entry)) return [];
  const out: DmRecebida[] = [];
  for (const entry of payload.entry) {
    if (!ehObjeto(entry) || typeof entry.id !== "string" || !Array.isArray(entry.messaging)) continue;
    for (const ev of entry.messaging) {
      if (!ehObjeto(ev) || !ehObjeto(ev.sender) || !ehObjeto(ev.recipient) || !ehObjeto(ev.message)) continue;
      const senderId = typeof ev.sender.id === "string" ? ev.sender.id : null;
      const recipientId = typeof ev.recipient.id === "string" ? ev.recipient.id : null;
      const mid = typeof ev.message.mid === "string" ? ev.message.mid : null;
      if (!senderId || !recipientId || !mid) continue;
      if (ev.message.is_echo === true || senderId === entry.id) continue; // eco do nosso próprio envio
      const anexos = Array.isArray(ev.message.attachments)
        ? ev.message.attachments.filter(
            (a): a is { type: string; payload: { url?: string } } => ehObjeto(a) && typeof a.type === "string" && ehObjeto(a.payload),
          )
        : [];
      const text = typeof ev.message.text === "string" ? ev.message.text : null;
      if (!text && anexos.length === 0) continue;
      out.push({
        igAccountId: entry.id,
        senderId,
        recipientId,
        messageId: mid,
        text,
        attachments: anexos,
        timestamp: typeof ev.timestamp === "number" ? ev.timestamp : null,
      });
    }
  }
  return out;
}

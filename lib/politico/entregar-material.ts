/**
 * ENTREGA DO MATERIAL NA RESPOSTA — o ebook chega sozinho quando a pessoa diz SIM.
 *
 * Reply-gated (decisão do cliente): o disparo manda o CONVITE ("posso te enviar o
 * ebook? responde SIM"); quando a pessoa responde afirmativamente, ISTO entrega o
 * material como ANEXO (documento no WhatsApp), sem repassar ao gabinete.
 *
 * Reusa o transporte que já existe: `sendMessageHandler` com `type:"document"` +
 * `media_url` → o WAHA baixa a URL de `pol_materiais` e entrega como arquivo.
 *
 * IDEMPOTENTE por `campaign_recipients.material_entregue_at`: a entrega é
 * RECLAMADA com compare-and-set (update ... where material_entregue_at is null)
 * ANTES do envio, então dois eventos da mesma resposta não mandam o PDF duas
 * vezes. Se o envio falhar, o carimbo é devolvido para `null` e uma próxima
 * resposta (ou o retry de 24h) tenta de novo.
 *
 * FAIL-SOFT: nunca lança — o chamador é um handler de evento.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { logger } from "@/lib/logger";
import { ehRespostaAfirmativa } from "@/lib/politico/resposta-afirmativa";

/** Janela em que uma resposta ainda "fecha" o convite do disparo (horas). */
const JANELA_DE_RESPOSTA_HORAS = 72;

export interface EntregaResultado {
  entregou: boolean;
  motivo?: "nao_afirmativo" | "sem_pendencia" | "material_invalido" | "ja_reclamado" | "envio_falhou";
  materialTitulo?: string;
}

/** mime do anexo a partir da extensão da URL (o WAHA infere o resto). */
function mimeDoArquivo(url: string): string | undefined {
  const limpo = url.split("?")[0]?.toLowerCase() ?? "";
  if (limpo.endsWith(".pdf")) return "application/pdf";
  if (limpo.endsWith(".doc") || limpo.endsWith(".docx")) return "application/msword";
  if (limpo.endsWith(".epub")) return "application/epub+zip";
  return undefined;
}

export async function entregarMaterialNaResposta(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; texto: string | null },
): Promise<EntregaResultado> {
  try {
    // 1) A resposta é um SIM? (amplo: sim/claro/pode/manda aí/quero…, com guarda de negação)
    if (!ehRespostaAfirmativa(entrada.texto)) return { entregou: false, motivo: "nao_afirmativo" };

    // 2) Há um disparo COM material aguardando resposta deste contato?
    const corte = new Date(Date.now() - JANELA_DE_RESPOSTA_HORAS * 3_600_000).toISOString();
    const { data: pend } = await admin
      .from("campaign_recipients")
      .select("id, sent_at, campaigns!inner(material_id, channel_session_id)")
      .eq("organization_id", entrada.organizationId)
      .eq("contact_id", entrada.contactId)
      .is("material_entregue_at", null)
      .in("status", ["sent", "delivered", "read", "replied"])
      .not("campaigns.material_id", "is", null)
      .gte("sent_at", corte)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pend) return { entregou: false, motivo: "sem_pendencia" };
    const recipiente = pend as unknown as {
      id: string;
      campaigns: { material_id: string; channel_session_id: string };
    };
    const materialId = recipiente.campaigns.material_id;
    const canalId = recipiente.campaigns.channel_session_id;

    // 3) O material está ativo e tem URL?
    const { data: mat } = await admin
      .from("pol_materiais")
      .select("titulo, url, capa_url, ativo")
      .eq("organization_id", entrada.organizationId)
      .eq("id", materialId)
      .maybeSingle();
    const material = mat as {
      titulo: string | null;
      url: string | null;
      capa_url: string | null;
      ativo: boolean | null;
    } | null;
    if (!material || material.ativo === false || !material.url) {
      return { entregou: false, motivo: "material_invalido" };
    }

    // 4) RECLAMA a entrega antes de enviar (compare-and-set). Quem não reclamar
    //    (outro evento concorrente) sai sem mandar o PDF duas vezes.
    const { data: claim } = await admin
      .from("campaign_recipients")
      .update({ material_entregue_at: new Date().toISOString() })
      .eq("id", recipiente.id)
      .is("material_entregue_at", null)
      .select("id")
      .maybeSingle();
    if (!claim) return { entregou: false, motivo: "ja_reclamado" };

    // 5) Entrega o material, pelo mesmo número do disparo.
    //
    // REGRA (cliente, 2026-10-25): SEMPRE com a CAPA — gera credibilidade. A capa
    // vai como IMAGEM, com a legenda, ANTES do PDF; o documento vem logo em
    // seguida, sem legenda (para não repetir). Sem capa cadastrada, o PDF carrega
    // a legenda. A capa é best-effort: se falhar, a legenda volta para o PDF e a
    // entrega do arquivo (que é o essencial) segue.
    try {
      const boundary = await beginServiceAtOrigin(admin, entrada.organizationId, entrada.contactId, canalId);
      const legenda = material.titulo
        ? `📘 Aqui está o material *${material.titulo}*. Qualquer dúvida, é só chamar! 🙂`
        : "📘 Aqui está o material que você pediu. Qualquer dúvida, é só chamar! 🙂";
      const ctx = {
        organization_id: entrada.organizationId,
        serviceBoundary: boundary,
        proactiveContext: { organizationId: entrada.organizationId, contactId: entrada.contactId },
        actor: { type: "webhook_source", id: `ebook-resposta:${recipiente.id}` },
        requestId: `ebook-resposta:${recipiente.id}:${randomUUID()}`,
      } as Parameters<typeof sendMessageHandler>[1];

      const capaValida =
        typeof material.capa_url === "string" && /^https?:\/\//.test(material.capa_url.trim());
      let legendaDoDocumento: string | undefined = legenda;
      if (capaValida) {
        try {
          await sendMessageHandler(admin, ctx, {
            conversation_id: boundary.conversation_id,
            type: "image",
            media_url: material.capa_url!,
            body: legenda,
            metadata: { source: "ebook_resposta_capa", material_id: materialId, recipient_id: recipiente.id },
          } as Parameters<typeof sendMessageHandler>[2]);
          legendaDoDocumento = undefined; // a capa já levou a legenda
        } catch {
          // Capa é bônus: se falhar, a legenda volta para o PDF e seguimos.
          legendaDoDocumento = legenda;
        }
      }

      const msg = await sendMessageHandler(admin, ctx, {
        conversation_id: boundary.conversation_id,
        type: "document",
        media_url: material.url,
        media_mime: mimeDoArquivo(material.url),
        body: legendaDoDocumento,
        metadata: { source: "ebook_resposta", material_id: materialId, recipient_id: recipiente.id },
      } as Parameters<typeof sendMessageHandler>[2]);
      if ((msg as { status?: string }).status === "failed") {
        // Devolve o carimbo para `null`: o retry de 24h (ou outra resposta) tenta de novo.
        await admin
          .from("campaign_recipients")
          .update({ material_entregue_at: null })
          .eq("id", recipiente.id);
        logger.warn("ebook: envio do material falhou no canal", {
          organization_id: entrada.organizationId,
          contact_id: entrada.contactId,
        });
        return { entregou: false, motivo: "envio_falhou" };
      }
    } catch (err) {
      await admin
        .from("campaign_recipients")
        .update({ material_entregue_at: null })
        .eq("id", recipiente.id);
      logger.warn("ebook: entrega do material lançou (carimbo devolvido)", {
        organization_id: entrada.organizationId,
        contact_id: entrada.contactId,
        detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
      });
      return { entregou: false, motivo: "envio_falhou" };
    }

    return { entregou: true, materialTitulo: material.titulo ?? undefined };
  } catch (err) {
    logger.warn("ebook: entrega falhou (a conversa segue normal)", {
      organization_id: entrada.organizationId,
      contact_id: entrada.contactId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return { entregou: false };
  }
}

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
import type { SupabaseClient } from "@supabase/supabase-js";

import { enviarMaterialComoDocumento } from "@/lib/politico/enviar-material";
import { recomputarEngajamento } from "@/lib/politico/engajamento";
import { logger } from "@/lib/logger";
import { ehRespostaAfirmativa } from "@/lib/politico/resposta-afirmativa";

/** Janela em que uma resposta ainda "fecha" o convite do disparo (horas). */
const JANELA_DE_RESPOSTA_HORAS = 72;

export interface EntregaResultado {
  entregou: boolean;
  motivo?: "nao_afirmativo" | "sem_pendencia" | "material_invalido" | "ja_reclamado" | "envio_falhou";
  materialTitulo?: string;
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

    // 5) Entrega o material como DOCUMENTO (anexo com nome), pelo número do
    //    disparo. A capa como imagem separada está DESLIGADA: este WAHA/NOWEB não
    //    entrega imagem proativa (medido 2026-10-25); o PDF sempre leva a legenda
    //    com o nome. A capa volta pela API Oficial. Envio compartilhado com o QR.
    const legenda = material.titulo
      ? `📘 Aqui está o material *${material.titulo}*. Qualquer dúvida, é só chamar! 🙂`
      : "📘 Aqui está o material que você pediu. Qualquer dúvida, é só chamar! 🙂";
    const r = await enviarMaterialComoDocumento(admin, {
      organizationId: entrada.organizationId,
      contactId: entrada.contactId,
      canalId,
      material: { titulo: material.titulo, url: material.url },
      legenda,
      rotulo: `ebook-resposta:${recipiente.id}`,
    });
    if (!r.enviou) {
      // Devolve o carimbo para `null`: o retry de 24h (ou outra resposta) tenta de novo.
      await admin
        .from("campaign_recipients")
        .update({ material_entregue_at: null })
        .eq("id", recipiente.id);
      logger.warn("ebook: envio do material falhou no canal", {
        organization_id: entrada.organizationId,
        contact_id: entrada.contactId,
        detail: r.erro,
      });
      return { entregou: false, motivo: "envio_falhou" };
    }

    // Material entregue é sinal do funil: recalcula o índice de engajamento.
    await recomputarEngajamento(admin, entrada.organizationId, entrada.contactId, { reason: "Recebeu material" });

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

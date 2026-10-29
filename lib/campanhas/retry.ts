/**
 * RETRY 24h do disparo — UMA cutucada para quem não respondeu.
 *
 * Opt-in por campanha (`campaigns.retry_24h`). Quem recebeu o convite há ≥24h e
 * NÃO respondeu (nem foi cutucado) ganha UMA mensagem gentil. `retry_at` trava
 * pra ser uma vez só (compare-and-set). Pausado: um punhado por rodada (a rodada
 * roda a cada minuto no campaign-worker) — e o gate pre_go_live do canal continua
 * valendo, então fora do go-live só os números de teste recebem.
 *
 * FAIL-SOFT: nunca lança (roda dentro de um cron).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { enviarTextoNoCanal } from "@/lib/politico/enviar-material";
import { lerIdentidadeDoMandato, novidadesDeLabel } from "@/lib/politico/identidade-do-mandato";

const JANELA_HORAS = 24;
/** Teto por rodada — cutucada é proativa-fria, então sai no gotejo (anti-ban). */
const POR_RODADA = 8;

export async function processarRetries(admin: SupabaseClient): Promise<{ enviados: number }> {
  try {
    const corte = new Date(Date.now() - JANELA_HORAS * 3_600_000).toISOString();
    const { data: camps } = await admin
      .from("campaigns")
      .select("id, organization_id, channel_session_id, material_id")
      .eq("retry_24h", true)
      .in("status", ["running", "completed"]);
    if (!camps || camps.length === 0) return { enviados: 0 };

    let enviados = 0;
    for (const c of camps as { id: string; organization_id: string; channel_session_id: string | null; material_id: string | null }[]) {
      if (enviados >= POR_RODADA) break;
      if (!c.channel_session_id) continue;

      // Identidade do mandato (nome do político) — uma leitura por campanha.
      const idm = await lerIdentidadeDoMandato(admin, c.organization_id);

      const { data: rec } = await admin
        .from("campaign_recipients")
        .select("id, contact_id")
        .eq("campaign_id", c.id)
        .is("replied_at", null)
        .is("retry_at", null)
        .in("status", ["sent", "delivered", "read"])
        .lte("sent_at", corte)
        .limit(POR_RODADA - enviados);

      for (const r of (rec ?? []) as { id: string; contact_id: string }[]) {
        if (enviados >= POR_RODADA) break;
        // Reclama a cutucada ANTES de enviar (compare-and-set) — uma vez só.
        const { data: claim } = await admin
          .from("campaign_recipients")
          .update({ retry_at: new Date().toISOString() })
          .eq("id", r.id)
          .is("retry_at", null)
          .select("id")
          .maybeSingle();
        if (!claim) continue;

        const texto = c.material_id
          ? "Oi! 🙂 Vi que a gente ainda não se falou. Ainda quer receber o material? É só responder *SIM* por aqui que te envio na hora."
          : `Oi! 🙂 Passando pra saber se você viu minha mensagem. Se quiser receber ${novidadesDeLabel(idm)}, é só me responder por aqui.`;
        const res = await enviarTextoNoCanal(admin, {
          organizationId: c.organization_id,
          contactId: r.contact_id,
          canalId: c.channel_session_id,
          texto,
          rotulo: `retry:${c.id}`,
        });
        // Enviou ou falhou, retry_at já está marcado: é UMA tentativa. Falha
        // (ex.: gate pre_go_live) não re-tenta — evita loop de spam.
        if (res.enviou) enviados++;
      }
    }
    return { enviados };
  } catch (err) {
    logger.warn("retry: rodada falhou", { detail: err instanceof Error ? err.message.slice(0, 160) : "?" });
    return { enviados: 0 };
  }
}

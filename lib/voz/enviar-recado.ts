/**
 * ENVIAR UM RECADO EM ÁUDIO (Voz do Mandato) numa conversa — o caminho
 * compartilhado entre o botão manual ("Avisar cidadão" em `avisarCidadao.ts`) e
 * a automação (`send_voice_recado`). Nasceu de dentro de `enviarRecadoDeVoz`
 * (avisarCidadao), extraído pra não ter DUAS cópias da sequência de compliance:
 * reescrever a sequência noutro lugar faria a nova nascer sem o conserto que a
 * antiga já tem.
 *
 * Travas, nesta ordem (qualquer tropeço vira STATUS, nunca exceção — quem chama
 * decide o fallback; o texto, quando há, já saiu):
 *   voz armada (ligada + clone + consentimento) → blackout eleitoral → TTS →
 *   converte pra ogg/opus → sobe → (aviso de IA em texto, se o áudio sai limpo) →
 *   envia o áudio.
 *
 * Guardrail TSE 23.755/2026: a nota de IA sempre acompanha o áudio — falada
 * dentro dele em modo campanha (`voz_rotulo_no_audio`), ou numa mensagem de
 * texto curta ao lado fora de campanha. Nunca envia sem o rótulo.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { lerVozConfig, vozArmada } from "@/lib/voz/config";
import { gerarAudio } from "@/lib/voz/elevenlabs";
import { lerVozSpeed, lerRotuloNoAudio } from "@/lib/voz/velocidade";
import { scriptRecado, AVISO_IA_TEXTO, type MomentoVoz } from "@/lib/voz/recado";
import { dentroDoBlackout } from "@/lib/voz/blackout";
import { mp3ParaNotaDeVoz, VOICE_MIME } from "@/lib/messaging/media/voice-transcode";
import { espacarEnvio } from "@/lib/automation/throttle";
import type { SendMessageInput } from "@/lib/schemas";

export type StatusRecadoVoz = "enviado" | "voz_desarmada" | "blackout" | "falha";

/** O contexto que o chamador passa ao `sendMessageHandler`, menos o `requestId`
 * (este helper gera um por envio, pra o texto-aviso e o áudio não colidirem na
 * idempotência). O manual passa `{organization_id, actor:user, idioma}`; a
 * automação passa `{organization_id, serviceBoundary, proactiveContext,
 * actor:webhook_source}`. */
type SendMeta = Omit<Parameters<typeof sendMessageHandler>[1], "requestId">;

export async function enviarRecadoDeVozNaConversa(args: {
  /** Client de leitura + envio (user ou admin, conforme o chamador). */
  db: SupabaseClient;
  /** Admin client — só pro upload no Storage (bypassa RLS). */
  admin: SupabaseClient;
  orgId: string;
  conversationId: string;
  momento: MomentoVoz;
  /** Primeiro nome do DESTINATÁRIO (não do político). `null` = sem nome. */
  primeiroNome: string | null;
  /** Nome do político que fala (da Identidade do Mandato). `null` = não se apresenta. */
  nomeParlamentar: string | null;
  sendMeta: SendMeta;
  /** Base do requestId (ex.: `rule:<id>`); ausente = aleatório (envio manual). */
  requestIdBase?: string;
  /** Quando presente, espaça os envios no número (throttle da automação). */
  sessionId?: string;
}): Promise<StatusRecadoVoz> {
  const { db, admin, orgId, conversationId, momento, primeiroNome, nomeParlamentar, sendMeta, sessionId } = args;
  const base = args.requestIdBase ?? randomUUID();
  try {
    const cfg = await lerVozConfig(db, orgId);
    if (!vozArmada(cfg) || !cfg.voiceId) return "voz_desarmada";
    if (dentroDoBlackout()) return "blackout";

    const { data: orgRow } = await db.from("organizations").select("settings").eq("id", orgId).maybeSingle();
    const velocidade = lerVozSpeed(orgRow?.settings);
    // Fora de campanha (padrão): áudio limpo + aviso de IA em texto. Campanha: falado.
    const rotuloNoAudio = lerRotuloNoAudio(orgRow?.settings);

    const texto = scriptRecado({
      momento,
      primeiroNome: primeiroNome || null,
      nomeParlamentar,
      incluirAvisoIA: rotuloNoAudio,
    });
    const r = await gerarAudio(cfg.voiceId, texto, velocidade);
    if (!r.ok) return "falha";

    const ogg = await mp3ParaNotaDeVoz(Buffer.from(r.audio));
    if (!ogg) return "falha";

    const waPath = `${orgId}/${conversationId}/recado-voz-${Date.now()}.ogg`;
    const up = await admin.storage
      .from("whatsapp-media")
      .upload(waPath, ogg.buffer, { contentType: VOICE_MIME, upsert: true });
    if (up.error) return "falha";

    if (!rotuloNoAudio) {
      try {
        if (sessionId) await espacarEnvio(sessionId);
        await sendMessageHandler(
          db,
          { ...sendMeta, requestId: `${base}:aviso` } as Parameters<typeof sendMessageHandler>[1],
          { conversation_id: conversationId, type: "text", body: AVISO_IA_TEXTO },
        );
      } catch { /* rótulo-texto best-effort; o áudio é o que importa */ }
    }

    if (sessionId) await espacarEnvio(sessionId);
    const input: SendMessageInput = {
      conversation_id: conversationId,
      type: "audio",
      media_storage_path: waPath,
      media_mime: VOICE_MIME,
      media_size_bytes: ogg.buffer.length,
    };
    await sendMessageHandler(
      db,
      { ...sendMeta, requestId: `${base}:audio` } as Parameters<typeof sendMessageHandler>[1],
      input,
    );
    return "enviado";
  } catch {
    return "falha";
  }
}

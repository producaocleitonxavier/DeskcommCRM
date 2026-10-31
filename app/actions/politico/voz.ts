"use server";

/**
 * Ações da "Voz do Mandato" (Fase 2). Só ADMIN. A org vem SEMPRE da sessão.
 *
 * - `clonarVozDoMandato`: recebe a amostra de áudio + o consentimento, cria o
 *   clone no provedor (ElevenLabs) e guarda o voice_id + o consentimento. NÃO
 *   liga a máquina (ativo segue false): clonar ≠ ativar.
 * - `alternarVozAtiva`: liga/desliga o envio (exige clone + consentimento).
 * - `gerarPreviaVoz`: gera um áudio de teste (base64) pra OUVIR a qualidade.
 *
 * Guardrail TSE 23.755/2026 (estrutural): sem consentimento assinado, não clona.
 */

import { randomUUID } from "node:crypto";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clonarVoz, gerarAudio } from "@/lib/voz/elevenlabs";
import { lerVozConfig, vozArmada } from "@/lib/voz/config";
import {
  CHAVE_GABINETE,
  CHAVE_VOZ_SPEED,
  clampVozSpeed,
  lerVozSpeed,
} from "@/lib/voz/velocidade";
import { comAvisoIA } from "@/lib/voz/recado";
import { dentroDoBlackout } from "@/lib/voz/blackout";
import { mp3ParaNotaDeVoz, VOICE_MIME } from "@/lib/messaging/media/voice-transcode";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { SendMessageInput } from "@/lib/schemas";

async function gerenteDaOrg() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { erro: "Sessão inválida." as const };
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.manager) {
    return { erro: "Requer Gerente ou Administrador (Assessoria técnica) para operar a Voz do Mandato." as const };
  }
  return { org, user };
}

export async function clonarVozDoMandato(
  form: FormData,
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await gerenteDaOrg();
  if ("erro" in ctx) return { ok: false, erro: ctx.erro };

  const consentiu = form.get("consentimento") === "on" || form.get("consentimento") === "true";
  const consentidoPor = String(form.get("consentido_por") ?? "").trim();
  if (!consentiu || !consentidoPor) {
    return { ok: false, erro: "É obrigatório marcar o consentimento e informar quem autorizou." };
  }

  const arquivo = form.get("amostra");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Envie a amostra de voz (áudio de ~2-3 minutos)." };
  }
  if (arquivo.size > 25 * 1024 * 1024) {
    return { ok: false, erro: "Amostra muito grande (máx. 25 MB). Grave ~2-3 minutos." };
  }

  const nome = `Voz do Mandato — ${ctx.org.orgId.slice(0, 8)}`;
  const blob = new Blob([await arquivo.arrayBuffer()], { type: arquivo.type || "audio/ogg" });
  const r = await clonarVoz(nome, blob, arquivo.name || "amostra.ogg");
  if (!r.ok) {
    let amigavel: string;
    if (r.erro === "sem_chave") {
      amigavel = "Falta configurar a chave do ElevenLabs no servidor.";
    } else if (/elevenlabs_40[013]|payment_required|paid_plan_required|can_not_use|voice_cloning|instant.?voice|clon/i.test(r.erro)) {
      amigavel =
        "Seu plano do ElevenLabs não permite clonar voz — o plano Free não inclui clonagem. " +
        "Faça upgrade para o Starter (~US$5/mês) e clique em clonar de novo.";
    } else {
      amigavel = `Falha ao clonar a voz: ${r.erro}`;
    }
    return { ok: false, erro: amigavel };
  }

  const db = await createClient();
  const { error } = await db.from("pol_voz_config").upsert(
    {
      organization_id: ctx.org.orgId,
      provider: "elevenlabs",
      voice_id: r.voiceId,
      consentimento_assinado: true,
      consentimento_por: consentidoPor,
      consentimento_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

export async function alternarVozAtiva(ativo: boolean): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await gerenteDaOrg();
  if ("erro" in ctx) return { ok: false, erro: ctx.erro };

  const db = await createClient();
  const cfg = await lerVozConfig(db, ctx.org.orgId);
  if (ativo && (!cfg.voiceId || !cfg.consentimentoAssinado)) {
    return { ok: false, erro: "Clone a voz e confirme o consentimento antes de ligar." };
  }
  const { error } = await db
    .from("pol_voz_config")
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.orgId);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Gera um áudio de teste (base64 data URL) pra ouvir a qualidade do clone.
 * `speed` opcional: se vier, usa pra TESTAR a velocidade na prévia; senão, usa
 * a velocidade salva da org. */
export async function gerarPreviaVoz(
  texto: string,
  speed?: number,
): Promise<{ ok: boolean; audioDataUrl?: string; erro?: string }> {
  const ctx = await gerenteDaOrg();
  if ("erro" in ctx) return { ok: false, erro: ctx.erro };

  const db = await createClient();
  const cfg = await lerVozConfig(db, ctx.org.orgId);
  if (!cfg.voiceId) return { ok: false, erro: "Clone a voz primeiro." };

  let velocidade: number;
  if (typeof speed === "number") {
    velocidade = clampVozSpeed(speed);
  } else {
    const { data: orgRow } = await db.from("organizations").select("settings").eq("id", ctx.org.orgId).maybeSingle();
    velocidade = lerVozSpeed(orgRow?.settings);
  }

  const r = await gerarAudio(cfg.voiceId, texto, velocidade);
  if (!r.ok) return { ok: false, erro: r.erro };
  const base64 = Buffer.from(r.audio).toString("base64");
  return { ok: true, audioDataUrl: `data:${r.contentType};base64,${base64}` };
}

/** Salva a velocidade preferida da voz (vale pra prévia e pros envios).
 * Mescla em `organizations.settings.gabinete.voz_speed` sem pisar no resto. */
export async function definirVozSpeed(speed: number): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await gerenteDaOrg();
  if ("erro" in ctx) return { ok: false, erro: ctx.erro };
  const db = await createClient();

  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", ctx.org.orgId).maybeSingle();
  const atual = (orgRow?.settings && typeof orgRow.settings === "object" ? orgRow.settings : {}) as Record<string, unknown>;
  const gab = (atual[CHAVE_GABINETE] && typeof atual[CHAVE_GABINETE] === "object" ? atual[CHAVE_GABINETE] : {}) as Record<string, unknown>;
  const novo = { ...atual, [CHAVE_GABINETE]: { ...gab, [CHAVE_VOZ_SPEED]: clampVozSpeed(speed) } };

  const { error } = await db.from("organizations").update({ settings: novo }).eq("id", ctx.org.orgId);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Lido pela tela (status atual). */
export async function lerStatusVoz() {
  const ctx = await gerenteDaOrg();
  if ("erro" in ctx) return { erro: ctx.erro };
  const db = await createClient();
  const cfg = await lerVozConfig(db, ctx.org.orgId);
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", ctx.org.orgId).maybeSingle();
  return { cfg, armada: vozArmada(cfg), velocidade: lerVozSpeed(orgRow?.settings) };
}

export type RecadoVozStatus = "enviado" | "voz_desarmada" | "blackout" | "sem_telefone" | "falha";

/**
 * PRIMITIVO REUTILIZÁVEL — manda uma nota de voz na voz do político pra QUALQUER
 * contato (cidadão, liderança, beneficiário). É o motor do componente que vive em
 * Demandas, Lideranças, Emendas e Obras. Travas centralizadas (consentimento via
 * vozArmada, aviso de IA falado, silêncio de 72h). 1:1 — nunca massa.
 */
export async function mandarRecadoDeVoz(
  contactId: string,
  texto: string,
): Promise<{ ok: boolean; erro?: string; status: RecadoVozStatus }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida.", status: "falha" };
  const corpo = (texto ?? "").trim();
  if (!corpo) return { ok: false, erro: "Escreva o texto do recado.", status: "falha" };

  const db = await createClient();
  const cfg = await lerVozConfig(db, org.orgId);
  if (!vozArmada(cfg) || !cfg.voiceId) {
    return { ok: false, erro: "A Voz do Mandato não está ligada. Ligue em Atendimento → Voz do Mandato.", status: "voz_desarmada" };
  }
  if (dentroDoBlackout()) {
    return { ok: false, erro: "Silêncio eleitoral (72h): não dá pra enviar áudio agora.", status: "blackout" };
  }

  const { data: contato } = await db.from("contacts").select("phone_number").eq("organization_id", org.orgId).eq("id", contactId).maybeSingle();
  if (!contato?.phone_number) return { ok: false, erro: "Esse contato não tem telefone cadastrado.", status: "sem_telefone" };

  const admin = createAdminClient();
  let conversationId: string;
  try {
    const r = await openSharedContactConversation(admin, org.orgId, { contact_id: contactId });
    conversationId = r.conversation_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "session_not_found") return { ok: false, erro: "Nenhum canal de WhatsApp conectado.", status: "falha" };
    if (msg === "contact_personal") return { ok: false, erro: "Este contato está marcado como pessoal.", status: "falha" };
    return { ok: false, erro: "Não consegui abrir a conversa do contato.", status: "falha" };
  }

  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  const velocidade = lerVozSpeed(orgRow?.settings);
  const a = await gerarAudio(cfg.voiceId, comAvisoIA(corpo), velocidade);
  if (!a.ok) return { ok: false, erro: "Falha ao gerar o áudio.", status: "falha" };
  const ogg = await mp3ParaNotaDeVoz(Buffer.from(a.audio));
  if (!ogg) return { ok: false, erro: "Falha ao preparar o áudio.", status: "falha" };

  const waPath = `${org.orgId}/${conversationId}/recado-voz-${Date.now()}.ogg`;
  const up = await admin.storage.from("whatsapp-media").upload(waPath, ogg.buffer, { contentType: VOICE_MIME, upsert: true });
  if (up.error) return { ok: false, erro: "Falha ao salvar o áudio.", status: "falha" };

  const input: SendMessageInput = {
    conversation_id: conversationId,
    type: "audio",
    media_storage_path: waPath,
    media_mime: VOICE_MIME,
    media_size_bytes: ogg.buffer.length,
  };
  try {
    await sendMessageHandler(
      db,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId: randomUUID(), idioma: user.idioma },
      input,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no envio.";
    return { ok: false, erro: `Não foi possível enviar: ${msg}`, status: "falha" };
  }
  return { ok: true, status: "enviado" };
}

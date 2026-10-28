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

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { clonarVoz, gerarAudio } from "@/lib/voz/elevenlabs";
import { lerVozConfig, vozArmada } from "@/lib/voz/config";
import {
  CHAVE_GABINETE,
  CHAVE_VOZ_SPEED,
  clampVozSpeed,
  lerVozSpeed,
} from "@/lib/voz/velocidade";

async function adminDaOrg() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { erro: "Sessão inválida." as const };
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.admin) {
    return { erro: "Apenas administradores configuram a Voz do Mandato." as const };
  }
  return { org, user };
}

export async function clonarVozDoMandato(
  form: FormData,
): Promise<{ ok: boolean; erro?: string }> {
  const ctx = await adminDaOrg();
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
  const ctx = await adminDaOrg();
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
  const ctx = await adminDaOrg();
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
  const ctx = await adminDaOrg();
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
  const ctx = await adminDaOrg();
  if ("erro" in ctx) return { erro: ctx.erro };
  const db = await createClient();
  const cfg = await lerVozConfig(db, ctx.org.orgId);
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", ctx.org.orgId).maybeSingle();
  return { cfg, armada: vozArmada(cfg), velocidade: lerVozSpeed(orgRow?.settings) };
}

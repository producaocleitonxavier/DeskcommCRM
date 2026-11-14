"use server";

/**
 * CONVITE A DIVULGADOR (peça 4). O político convida quem já é Participante (ou mais) a virar
 * divulgadores: manda um convite 1-a-1 no WhatsApp ("quer conteúdos exclusivos e
 * ajudar a espalhar? Responda SIM") e marca a tag `divulgador_convidado`. Quando a
 * pessoa responde SIM, o handler `divulgador-aceite` a promove a multiplicador.
 *
 * Reusa o transporte do CRM (openSharedContactConversation + sendMessageHandler),
 * igual ao envio aos multiplicadores. A trava de GO-LIVE é aplicada lá embaixo
 * (antes do go-live, só número de teste recebe). `organization_id` sempre de
 * resolveActiveOrg, nunca do input.
 */

import { autenticarComPapel } from "@/lib/politico/acesso";
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ApiError } from "@/lib/api/types";
import {
  contarElegiveisParaConvite,
  listarElegiveisParaConvite,
  TAG_DIVULGADOR_CONVIDADO,
} from "@/lib/politico/divulgador";
import { lerCanalMultiplicadores } from "@/lib/politico/multiplicadores-canal";

/** Teto por leva de convites (anti-ban + guarda sã). */
const CAP_CONVITE = 200;

/** WhatsApp BR plausível (+55 + DDD 11–99 + 8/9 dígitos). */
function isWhatsappBRPlausivel(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+55") && (d.length === 12 || d.length === 13) && /^[1-9][0-9]$/.test(d.slice(2, 4));
}

/** Quantos participantes (ou mais) podem ser convidados agora (pra o rótulo do botão). */
export async function contarElegiveis(): Promise<number> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return 0;
  const db = await createClient();
  return contarElegiveisParaConvite(db, org.orgId);
}

/** A mensagem de convite (com o aceite por "SIM"). */
function corpoConvite(primeiroNome: string): string {
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  return (
    `${ola} 👋 Você faz parte do nosso mandato e queremos te convidar pra algo especial: ` +
    `receber nossos conteúdos *exclusivos* antes de todo mundo e ajudar a espalhar.\n\n` +
    `Topa? Responda *SIM* 🙏`
  );
}

export type ConviteResultado =
  | { ok: true; total: number; convidados: number; pulados: { nome: string; motivo: string }[] }
  | { ok: false; erro: string };

/**
 * Convida os participantes (ou mais) elegíveis (cap 200). Pra cada: manda o convite e marca a
 * tag `divulgador_convidado`. Sem canal de WhatsApp conectado, aborta com erro
 * claro (no teste não há WAHA). Sequencial e gentil.
 */
export async function convidarDivulgadores(): Promise<ConviteResultado> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const admin = createAdminClient();

  const elegiveis = await listarElegiveisParaConvite(db, org.orgId, CAP_CONVITE);
  if (elegiveis.length === 0) {
    return { ok: false, erro: "Ninguém elegível pra convidar agora." };
  }

  // Número DEDICADO dos multiplicadores (anti-ban): o convite sai por ele se
  // configurado; senão (null) automático, como antes.
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  const canal = lerCanalMultiplicadores((orgRow as { settings?: unknown } | null)?.settings) ?? undefined;

  const pulados: { nome: string; motivo: string }[] = [];
  let convidados = 0;
  let semCanal = false;

  for (const c of elegiveis) {
    const nome = (c.name ?? "Sem nome").trim();
    const primeiroNome = (c.name ?? "").trim().split(/\s+/)[0] ?? "";
    const phone = (c.phone_number ?? "").trim();
    if (!phone || !isWhatsappBRPlausivel(phone)) {
      pulados.push({ nome, motivo: "número inválido" });
      continue;
    }

    let conversationId: string;
    try {
      const r = await openSharedContactConversation(admin, org.orgId, { contact_id: c.id, channel_session_id: canal });
      conversationId = r.conversation_id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "session_not_found") {
        semCanal = true;
        break;
      }
      if (msg === "contact_personal") {
        pulados.push({ nome, motivo: "contato pessoal" });
        continue;
      }
      pulados.push({ nome, motivo: "não abriu a conversa" });
      continue;
    }

    try {
      await sendMessageHandler(
        db,
        { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId: randomUUID(), idioma: user.idioma },
        { conversation_id: conversationId, type: "text", body: corpoConvite(primeiroNome) },
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "falha no envio";
      pulados.push({ nome, motivo: msg.slice(0, 60) });
      continue;
    }

    // Marca o convite pendente (read-modify-write, sem duplicar).
    const { data: ct } = await admin
      .from("contacts")
      .select("tags")
      .eq("organization_id", org.orgId)
      .eq("id", c.id)
      .maybeSingle();
    const atuais = ((((ct as { tags: string[] | null } | null)?.tags) ?? []) as string[]).filter(
      (t) => typeof t === "string",
    );
    if (!atuais.includes(TAG_DIVULGADOR_CONVIDADO)) {
      await admin
        .from("contacts")
        .update({ tags: [...atuais, TAG_DIVULGADOR_CONVIDADO] })
        .eq("id", c.id)
        .eq("organization_id", org.orgId);
    }
    convidados += 1;
  }

  if (semCanal && convidados === 0) {
    return {
      ok: false,
      erro: "Nenhum canal de WhatsApp conectado. Conecte um canal (em produção) para convidar.",
    };
  }

  revalidatePath("/app/politico/multiplicadores");
  return { ok: true, total: elegiveis.length, convidados, pulados };
}

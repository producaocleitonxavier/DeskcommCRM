"use server";

/**
 * ENVIO 1-A-1 AOS MULTIPLICADORES (peça 3 do bloco Multiplicadores).
 *
 * O político escolhe um vídeo da biblioteca e o sistema manda, no PRIVADO de
 * cada multiplicador marcado, o LINK PESSOAL dele daquele vídeo — "compartilhe
 * com a sua rede". Cada abertura pelo link dele vira ALCANCE dele (o placar
 * mede). Tira o trabalho manual de mandar um por um.
 *
 * Reusa o transporte do CRM (openSharedContactConversation + sendMessageHandler),
 * o MESMO de avisarCidadao. A trava de GO-LIVE é aplicada automaticamente lá
 * embaixo (antes do go-live, mensagem pra número que não é de teste vira
 * `failed`/`pre_go_live` — nenhum envio real a eleitor acontece). Tudo no
 * servidor, `organization_id` sempre de resolveActiveOrg (nunca do input).
 */

import { randomUUID } from "node:crypto";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { obterOuCriarShare, urlDoVideoShare } from "@/lib/politico/video-share";
import { TAG_MULTIPLICADOR } from "@/lib/politico/multiplicadores";
import { ApiError } from "@/lib/api/types";

/** Teto por disparo — o cohort de multiplicadores é pequeno; guarda sã contra engano. */
const CAP_ENVIO = 300;

/** WhatsApp BR plausível (+55 + DDD 11–99 + 8/9 dígitos). Mesmo critério de avisarCidadao. */
function isWhatsappBRPlausivel(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+55") && (d.length === 12 || d.length === 13) && /^[1-9][0-9]$/.test(d.slice(2, 4));
}

export interface VideoDaBiblioteca {
  id: string;
  titulo: string;
}

/** Vídeos da biblioteca (posts do Instagram) que podem ser mandados aos multiplicadores. */
export async function listarVideosDaBiblioteca(): Promise<VideoDaBiblioteca[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_materiais")
    .select("id, titulo")
    .eq("organization_id", org.orgId)
    .eq("tipo", "video")
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as { id: string; titulo: string | null }[]).map((m) => ({
    id: m.id,
    titulo: (m.titulo ?? "").trim() || "Vídeo sem título",
  }));
}

/** A mensagem que cada multiplicador recebe, com o LINK PESSOAL dele. */
function corpoDaMensagem(primeiroNome: string, url: string): string {
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  return (
    `${ola} 👋 Saiu um conteúdo novo do nosso mandato.\n\n` +
    `Compartilhe com a sua rede por ESTE link — ele é *só seu*:\n${url}\n\n` +
    `Cada pessoa que abrir pelo seu link conta como alcance seu. Obrigado por multiplicar! 🙏`
  );
}

export type EnvioMultiplicadoresResultado =
  | {
      ok: true;
      total: number;
      enviados: number;
      pulados: { nome: string; motivo: string }[];
    }
  | { ok: false; erro: string };

/**
 * Manda o vídeo (link pessoal) pra cada multiplicador marcado. Sequencial e
 * gentil (sem rajada). Pula quem não tem telefone válido, com o motivo. Se não
 * houver canal de WhatsApp conectado, aborta com erro claro (no teste não há
 * WAHA — a tela mostra isso em vez de "enviar" no vazio).
 */
export async function enviarVideoAosMultiplicadores(materialId: string): Promise<EnvioMultiplicadoresResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const admin = createAdminClient();

  const mid = (materialId ?? "").trim();
  if (!mid) return { ok: false, erro: "Escolha um vídeo." };

  // Confere que o vídeo é desta org (não dispara material alheio).
  const { data: mat } = await admin
    .from("pol_materiais")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("id", mid)
    .eq("tipo", "video")
    .maybeSingle();
  if (!mat) return { ok: false, erro: "Vídeo não encontrado nesta biblioteca." };

  // Cohort = contatos marcados como multiplicador.
  const { data: ctsData } = await db
    .from("contacts")
    .select("id, name, phone_number")
    .eq("organization_id", org.orgId)
    .contains("tags", [TAG_MULTIPLICADOR])
    .limit(CAP_ENVIO);
  const cohort = (ctsData ?? []) as { id: string; name: string | null; phone_number: string | null }[];
  if (cohort.length === 0) {
    return { ok: false, erro: "Nenhum multiplicador marcado ainda. Marque seus assessores/lideranças primeiro." };
  }

  const pulados: { nome: string; motivo: string }[] = [];
  let enviados = 0;
  let semCanal = false;

  for (const c of cohort) {
    const nome = (c.name ?? "Sem nome").trim();
    const primeiroNome = nome.split(/\s+/)[0] ?? "";
    const phone = (c.phone_number ?? "").trim();
    if (!phone) {
      pulados.push({ nome, motivo: "sem telefone" });
      continue;
    }
    if (!isWhatsappBRPlausivel(phone)) {
      pulados.push({ nome, motivo: "número inválido" });
      continue;
    }

    // Conversa no canal pronto. Sem canal (ex.: ambiente de teste) = aborta: todos
    // falhariam igual, então para e avisa uma vez só.
    let conversationId: string;
    try {
      const r = await openSharedContactConversation(admin, org.orgId, { contact_id: c.id });
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

    // Link PESSOAL deste multiplicador para este vídeo (pega-ou-cria).
    const shareId = await obterOuCriarShare(admin, {
      organizationId: org.orgId,
      materialId: mid,
      contactId: c.id,
    });
    if (!shareId) {
      pulados.push({ nome, motivo: "falha ao gerar o link" });
      continue;
    }
    const url = urlDoVideoShare(shareId);

    try {
      await sendMessageHandler(
        db,
        { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId: randomUUID(), idioma: user.idioma },
        { conversation_id: conversationId, type: "text", body: corpoDaMensagem(primeiroNome, url) },
      );
      enviados += 1;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "falha no envio";
      pulados.push({ nome, motivo: msg.slice(0, 60) });
    }
  }

  if (semCanal && enviados === 0) {
    return {
      ok: false,
      erro: "Nenhum canal de WhatsApp conectado. Conecte um canal (em produção) para enviar aos multiplicadores.",
    };
  }

  return { ok: true, total: cohort.length, enviados, pulados };
}

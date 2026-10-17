"use server";

/**
 * "Avisar cidadão" (Gabinete): envia ao cidadão da demanda uma mensagem de
 * WhatsApp confirmando o registro e o encaminhamento do ofício. Disparo MANUAL
 * (um botão no detalhe), nunca automático.
 *
 * Reaproveita o caminho de envio do próprio CRM: resolve/abre a conversa 1:1 do
 * contato no canal pronto (`openSharedContactConversation`) e envia pelo handler
 * de mensagens (`sendMessageHandler`) — a mensagem entra no histórico da conversa
 * como qualquer atendimento. Tudo no servidor (sessão autenticada).
 */

import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ApiError } from "@/lib/api/types";
import type { SendMessageInput } from "@/lib/schemas";

export type AvisoResultado = { ok: true; protocolo: string } | { ok: false; erro: string };

interface DemandaParaAviso {
  id: string;
  contact_id: string | null;
  assunto: string | null;
  pol_orgao_destino: string | null;
  pol_oficio_numero: number | null;
  pol_oficio_ano: number | null;
  contacts: { name: string | null; phone_number: string | null } | null;
}

function protocoloDe(d: DemandaParaAviso): string {
  if (d.pol_oficio_numero && d.pol_oficio_ano) {
    return `OF ${String(d.pol_oficio_numero).padStart(3, "0")}/${d.pol_oficio_ano}`;
  }
  return `#${d.id.slice(0, 8).toUpperCase()}`;
}

export async function avisarCidadao(demandaId: string): Promise<AvisoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data, error } = await db
    .from("demandas")
    .select("id, contact_id, assunto, pol_orgao_destino, pol_oficio_numero, pol_oficio_ano, contacts(name, phone_number)")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (error) return { ok: false, erro: "Erro ao carregar a demanda." };
  if (!data) return { ok: false, erro: "Demanda não encontrada." };
  const d = data as unknown as DemandaParaAviso;

  if (!d.contact_id) return { ok: false, erro: "Esta demanda não tem cidadão vinculado." };
  const contato = d.contacts;
  if (!contato?.phone_number) {
    return { ok: false, erro: "O cidadão não tem telefone cadastrado — não há como avisar por WhatsApp." };
  }

  // Resolve/abre a conversa no canal de WhatsApp pronto (escolhe sozinho).
  const admin = createAdminClient();
  let conversationId: string;
  try {
    const r = await openSharedContactConversation(admin, org.orgId, { contact_id: d.contact_id });
    conversationId = r.conversation_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "session_not_found") {
      return { ok: false, erro: "Nenhum canal de WhatsApp conectado para enviar. Conecte um canal e tente de novo." };
    }
    if (msg === "contact_personal") return { ok: false, erro: "Este contato está marcado como pessoal." };
    return { ok: false, erro: "Não consegui abrir a conversa do cidadão." };
  }

  const protocolo = protocoloDe(d);
  const primeiroNome = (contato.name ?? "").trim().split(/\s+/)[0] || "tudo bem";
  const assunto = d.assunto?.trim();
  const orgao = d.pol_orgao_destino?.trim();
  const corpo =
    `Olá, ${primeiroNome}! Sua demanda (protocolo ${protocolo})` +
    (assunto ? ` sobre "${assunto}"` : "") +
    ` foi registrada no gabinete` +
    (orgao ? ` e já encaminhamos o ofício à ${orgao}.` : ` e já encaminhamos o ofício ao órgão competente.`) +
    ` Assim que houver novidades, retornaremos por aqui. Obrigado por nos acionar.`;

  const input: SendMessageInput = { conversation_id: conversationId, type: "text", body: corpo };
  try {
    await sendMessageHandler(
      db,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId: randomUUID(), idioma: user.idioma },
      input,
    );
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Falha no envio.";
    return { ok: false, erro: `Não foi possível enviar: ${msg}` };
  }

  return { ok: true, protocolo };
}

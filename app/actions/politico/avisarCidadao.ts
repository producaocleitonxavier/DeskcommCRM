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
import { gerarOficioDemanda } from "@/app/actions/politico/gerarOficio";
import { ApiError } from "@/lib/api/types";
import type { SendMessageInput } from "@/lib/schemas";

export type AvisoResultado = { ok: true; protocolo: string; comOficio: boolean } | { ok: false; erro: string };

interface DemandaParaAviso {
  id: string;
  estado: string;
  contact_id: string | null;
  assunto: string | null;
  pol_orgao_destino: string | null;
  pol_encaminhamento_ia: string | null;
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
    .select("id, estado, contact_id, assunto, pol_orgao_destino, pol_encaminhamento_ia, pol_oficio_numero, pol_oficio_ano, contacts(name, phone_number)")
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

  // A mensagem muda conforme o estado: resolvida = boa notícia (sem anexar o
  // ofício de novo); demais = registro + encaminhamento (com o ofício anexo).
  const ehResolucao = d.estado === "resolvida";

  // Ofício em PDF para anexar: só no aviso de encaminhamento (não na resolução),
  // e se houver encaminhamento. Gera se preciso e baixa os bytes.
  let numero = d.pol_oficio_numero;
  let ano = d.pol_oficio_ano;
  let oficioBytes: Buffer | null = null;
  const oficioPath = `${org.orgId}/${demandaId}/oficio.pdf`;
  if (!ehResolucao && d.pol_encaminhamento_ia?.trim()) {
    let dl = await admin.storage.from("gabinete-anexos").download(oficioPath);
    if (dl.error || !dl.data) {
      const g = await gerarOficioDemanda(demandaId);
      if (g.ok) {
        numero = g.numero;
        ano = g.ano;
      }
      dl = await admin.storage.from("gabinete-anexos").download(oficioPath);
    }
    if (dl.data) oficioBytes = Buffer.from(await dl.data.arrayBuffer());
  }

  const protocolo = numero && ano ? `OF ${String(numero).padStart(3, "0")}/${ano}` : protocoloDe(d);
  const primeiroNome = (contato.name ?? "").trim().split(/\s+/)[0] ?? "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  // Mensagem GENÉRICA de propósito: NÃO embute o assunto (que costuma ser a
  // descrição longa do cidadão e deixa o texto feio). O detalhe vai no ofício.
  const corpo = ehResolucao
    ? `${saudacao} Boa notícia: a sua demanda (protocolo ${protocolo}) foi RESOLVIDA.` +
      ` Agradecemos a confiança e seguimos à disposição para o que precisar.` +
      ` Conte sempre com o nosso gabinete.`
    : `${saudacao} Passo para avisar que a sua demanda (protocolo ${protocolo})` +
      ` já foi encaminhada ao órgão competente para a resolução.` +
      ` Assim que houver novidades, te retorno por aqui, ok?` +
      (oficioBytes ? ` Encaminho o ofício para seu conhecimento.` : "") +
      ` Sigo à disposição. Conte sempre com o nosso gabinete.`;

  // Com ofício: copia o PDF para o bucket da conversa (whatsapp-media sob
  // {org}/{conversa}/, exigência do handler) e envia como DOCUMENTO com o texto
  // de legenda — uma única mensagem. Sem ofício: texto puro.
  let input: SendMessageInput;
  if (oficioBytes) {
    const nomeArquivo = `Oficio-${String(numero ?? 0).padStart(3, "0")}-${ano ?? new Date().getFullYear()}.pdf`;
    const waPath = `${org.orgId}/${conversationId}/${nomeArquivo}`;
    const up = await admin.storage
      .from("whatsapp-media")
      .upload(waPath, oficioBytes, { contentType: "application/pdf", upsert: true });
    if (up.error) {
      // Falhou copiar o anexo: não perde o aviso — manda ao menos o texto.
      input = { conversation_id: conversationId, type: "text", body: corpo };
    } else {
      input = {
        conversation_id: conversationId,
        type: "document",
        media_storage_path: waPath,
        media_mime: "application/pdf",
        media_size_bytes: oficioBytes.length,
        body: corpo,
      };
    }
  } else {
    input = { conversation_id: conversationId, type: "text", body: corpo };
  }

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

  const comOficio = !!oficioBytes && input.type === "document";
  // Histórico: registra o aviso enviado.
  await db.from("pol_demanda_eventos").insert({
    organization_id: org.orgId,
    demanda_id: demandaId,
    tipo: "cidadao_avisado",
    descricao: ehResolucao
      ? "Cidadão avisado da resolução por WhatsApp"
      : `Cidadão avisado por WhatsApp${comOficio ? ` (com ofício ${protocolo})` : ""}`,
    created_by: user.id,
  });

  return { ok: true, protocolo, comOficio };
}

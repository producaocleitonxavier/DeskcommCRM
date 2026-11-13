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

import { autenticarComPapel } from "@/lib/politico/acesso";
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { gerarOficioDemanda } from "@/app/actions/politico/gerarOficio";
import { ApiError } from "@/lib/api/types";
import { avisoDeResolucaoLigado } from "@/lib/politico/aviso-de-resolucao";
import { enviarRecadoDeVozNaConversa } from "@/lib/voz/enviar-recado";
import type { MomentoVoz } from "@/lib/voz/recado";
import { lerIdentidadeDoMandato } from "@/lib/politico/identidade-do-mandato";
import { textoAvisoCidadao } from "@/lib/politico/aviso-cidadao-texto";
import { pedirAvaliacaoDoAtendimento } from "@/lib/politico/avaliacao";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SendMessageInput } from "@/lib/schemas";

/** Status do recado em áudio (Voz do Mandato), quando pedido. */
export type AudioRecadoStatus = "enviado" | "voz_desarmada" | "blackout" | "falha";

export type AvisoResultado =
  | { ok: true; protocolo: string; comOficio: boolean; audio?: AudioRecadoStatus; textoEnviado: boolean }
  | { ok: false; erro: string };

/** Descrição EXATA do evento de histórico quando o cidadão é avisado da
 * resolução. É a chave de idempotência do ciclo automático (`avisarResolucaoAutomatica`)
 * — por isso vive numa constante, não como literal solto nos dois lugares. */
const AVISO_RESOLUCAO_DESCRICAO = "Cidadão avisado da resolução por WhatsApp";

/** É um WhatsApp BR plausível para envio? +55 + DDD (11–99) + número local (8/9).
 * Pega o número malformado (+31… = DDD de BH sem o 55) antes de "enviar" para
 * um número que o WhatsApp não entrega — era o que mostrava ✓ falso. */
function isWhatsappBRPlausivel(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+55") && (d.length === 12 || d.length === 13) && /^[1-9][0-9]$/.test(d.slice(2, 4));
}

interface DemandaParaAviso {
  id: string;
  estado: string;
  contact_id: string | null;
  assunto: string | null;
  pol_orgao_destino: string | null;
  pol_encaminhamento_ia: string | null;
  pol_oficio_rotulo: string | null;
  contacts: { name: string | null; phone_number: string | null } | null;
}

function protocoloDe(d: DemandaParaAviso): string {
  const rotulo = (d.pol_oficio_rotulo ?? "").trim();
  if (rotulo) return rotulo;
  return `#${d.id.slice(0, 8).toUpperCase()}`;
}

export async function avisarCidadao(
  demandaId: string,
  opts?: { incluirAudio?: boolean; texto?: string; /** Aviso de encerramento sem solução: sem ofício em anexo. */ encerramento?: boolean },
): Promise<AvisoResultado> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data, error } = await db
    .from("demandas")
    .select("id, estado, contact_id, assunto, pol_orgao_destino, pol_encaminhamento_ia, pol_oficio_rotulo, contacts(name, phone_number)")
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
  if (!isWhatsappBRPlausivel(contato.phone_number)) {
    return {
      ok: false,
      erro: `O número ${contato.phone_number} não é um WhatsApp brasileiro válido (precisa de +55 + DDD). Corrija o cadastro do cidadão com DDD + número (ex.: 31 99999-9999).`,
    };
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

  const ehResolucao = d.estado === "resolvida";
  const primeiroNome = (contato.name ?? "").trim().split(/\s+/)[0] ?? "";

  // Nome do gabinete pro texto de encaminhamento — vem da Identidade do Gabinete
  // (pol_gabinete_config), NUNCA cravado: no SaaS cada cliente tem o seu. Sem
  // nome configurado, cai no genérico "do nosso gabinete".
  const { data: gabCfg } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const nomeParl = ((gabCfg?.nome_parlamentar as string | null) ?? "").trim();
  const cargoParl = ((gabCfg?.cargo as string | null) ?? "").trim();
  const assinaturaGab = nomeParl ? ` do ${cargoParl ? cargoParl + " " : ""}${nomeParl}` : "";

  // Idempotência do TEXTO de resolução: o aviso automático ao resolver já mandou
  // o texto. Se o cliente depois clica "Avisar cidadão" (ex.: pra incluir o
  // áudio), NÃO reenviamos o texto — senão chega duplicado (bug relatado). O
  // áudio, sim, segue normalmente.
  let textoJaEnviado = false;
  if (ehResolucao) {
    const { data: ja } = await db
      .from("pol_demanda_eventos")
      .select("id")
      .eq("organization_id", org.orgId)
      .eq("demanda_id", demandaId)
      .eq("tipo", "cidadao_avisado")
      .eq("descricao", AVISO_RESOLUCAO_DESCRICAO)
      .limit(1)
      .maybeSingle();
    textoJaEnviado = !!ja;
  }

  let rotulo = (d.pol_oficio_rotulo ?? "").trim();
  let comOficio = false;
  let textoEnviado = false;

  if (!textoJaEnviado) {
    // Ofício em PDF para anexar: só no encaminhamento (não na resolução), e se
    // houver encaminhamento. Gera se preciso e baixa os bytes.
    let oficioBytes: Buffer | null = null;
    const oficioPath = `${org.orgId}/${demandaId}/oficio.pdf`;
    if (!ehResolucao && !opts?.encerramento && d.pol_encaminhamento_ia?.trim()) {
      let dl = await admin.storage.from("gabinete-anexos").download(oficioPath);
      if (dl.error || !dl.data) {
        const g = await gerarOficioDemanda(demandaId);
        if (g.ok) rotulo = g.rotulo;
        dl = await admin.storage.from("gabinete-anexos").download(oficioPath);
      }
      if (dl.data) oficioBytes = Buffer.from(await dl.data.arrayBuffer());
    }

    const protocoloLocal = rotulo || protocoloDe(d);

    // Modo assistido: se o assessor editou o texto no modal, usa o DELE; senão,
    // a sugestão automática (mesma função pura que a tela usa no preview).
    const sugerido = textoAvisoCidadao({
      ehResolucao,
      comOficio: !!oficioBytes,
      primeiroNome,
      nomeParlamentar: nomeParl || null,
      cargo: cargoParl || null,
      protocolo: protocoloLocal,
    });
    const corpo = (opts?.texto ?? "").trim() || sugerido;

    // Com ofício: copia o PDF para o bucket da conversa (whatsapp-media sob
    // {org}/{conversa}/, exigência do handler) e envia como DOCUMENTO com o texto
    // de legenda — uma única mensagem. Sem ofício: texto puro.
    let input: SendMessageInput;
    if (oficioBytes) {
      const nomeArquivo = `Oficio-${(rotulo || "gabinete").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80)}.pdf`;
      const waPath = `${org.orgId}/${conversationId}/${nomeArquivo}`;
      const up = await admin.storage
        .from("whatsapp-media")
        .upload(waPath, oficioBytes, { contentType: "application/pdf", upsert: true });
      if (up.error) {
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

    comOficio = !!oficioBytes && input.type === "document";
    textoEnviado = true;

    // Histórico: registra o aviso enviado.
    await db.from("pol_demanda_eventos").insert({
      organization_id: org.orgId,
      demanda_id: demandaId,
      tipo: "cidadao_avisado",
      descricao: ehResolucao
        ? AVISO_RESOLUCAO_DESCRICAO
        : opts?.encerramento
          ? "Cidadão avisado de que a demanda foi encerrada sem solução"
          : `Cidadão avisado por WhatsApp${comOficio ? ` (com ofício ${protocoloLocal})` : ""}`,
      created_by: user.id,
    });
  }

  const protocolo = rotulo || protocoloDe(d);

  // NOTA DO CIDADÃO: atendimento terminou (resolvida ou encerrada) e o aviso saiu
  // → uma SEGUNDA mensagem, sem link, pergunta a nota de 1 a 5. Uma vez por
  // demanda; nunca derruba o aviso que já foi.
  if (textoEnviado && (ehResolucao || opts?.encerramento)) {
    await pedirAvaliacaoDoAtendimento({ db, admin, orgId: org.orgId, demandaId, conversationId, userId: user.id, idioma: user.idioma });
  }

  // VOZ DO MANDATO: se o cliente pediu "incluir recado em áudio", manda a nota
  // de voz DEPOIS do texto (ou sozinha, se o texto já tinha ido). Nunca falha o
  // aviso por causa do áudio.
  let audio: AudioRecadoStatus | undefined;
  if (opts?.incluirAudio) {
    audio = await enviarRecadoDeVoz({
      db,
      admin,
      orgId: org.orgId,
      userId: user.id,
      conversationId,
      demandaId,
      momento: ehResolucao ? "resolucao" : "encaminhamento",
      primeiroNome,
      idioma: user.idioma,
    });
  }

  return { ok: true, protocolo, comOficio, audio, textoEnviado };
}

/**
 * Gera e envia o recado em áudio na voz do Mandato (nota de voz no WhatsApp).
 * Travas (nesta ordem): voz armada (ligada + clone + consentimento) → fora do
 * blackout eleitoral → TTS → converte pra ogg/opus → sobe → envia. Qualquer
 * tropeço devolve um status, nunca lança: o texto já saiu.
 */
async function enviarRecadoDeVoz(args: {
  db: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  userId: string;
  conversationId: string;
  demandaId: string;
  momento: MomentoVoz;
  primeiroNome: string;
  idioma: "es" | "pt-BR" | undefined;
}): Promise<AudioRecadoStatus> {
  const { db, admin, orgId, userId, conversationId, demandaId, momento, primeiroNome, idioma } = args;
  // Toda a geração+envio do áudio vive no helper compartilhado (`lib/voz/enviar-recado.ts`),
  // o MESMO que a automação `send_voice_recado` usa. Aqui fica só o que é do
  // ciclo da demanda: o nome de quem fala e o registro do evento.
  const idMandato = await lerIdentidadeDoMandato(db, orgId);
  const status = await enviarRecadoDeVozNaConversa({
    db,
    admin,
    orgId,
    conversationId,
    momento,
    primeiroNome: primeiroNome || null,
    nomeParlamentar: idMandato.nomeParlamentar,
    // Envio manual (botão): actor é o usuário; sem throttle de automação.
    sendMeta: { organization_id: orgId, actor: { type: "user", id: userId }, idioma },
  });

  if (status === "enviado") {
    await db.from("pol_demanda_eventos").insert({
      organization_id: orgId,
      demanda_id: demandaId,
      tipo: "cidadao_avisado",
      descricao: "Recado em áudio na voz do Mandato enviado",
      created_by: userId,
    });
  }
  return status;
}

/**
 * CICLO DA DEMANDA — avisa o cidadão AUTOMATICAMENTE quando a demanda é resolvida.
 *
 * É o "resolvemos o que você pediu" sem depender de alguém lembrar de clicar: o
 * cliente chama isto logo depois de marcar a demanda como resolvida. Reaproveita
 * `avisarCidadao` (que, no estado 'resolvida', manda a boa notícia). Três guardas,
 * para nunca mandar o que não deve:
 *   1. só com a demanda já em 'resolvida' (o cliente pode chamar fora de hora);
 *   2. só se o cidadão tem telefone — senão não há como avisar, e devolve o motivo
 *      para a tela dizer "resolvida, mas sem telefone" em vez de um erro;
 *   3. idempotente: se o aviso de resolução já saiu (o botão manual grava o MESMO
 *      evento, `AVISO_RESOLUCAO_DESCRICAO`), não reenvia.
 * Nunca lança: a resolução da demanda não pode falhar porque o WhatsApp falhou.
 */
export type AvisoAutoResultado =
  | { ok: true; enviado: true; protocolo: string }
  | { ok: true; enviado: false; motivo: "sem_telefone" | "numero_invalido" | "ja_avisado" | "nao_resolvida" | "desligado" }
  | { ok: false; erro: string };

export async function avisarResolucaoAutomatica(demandaId: string): Promise<AvisoAutoResultado> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  // Interruptor da org (default LIGADO). Desligado = resolve sem avisar.
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  if (!avisoDeResolucaoLigado(orgRow?.settings)) return { ok: true, enviado: false, motivo: "desligado" };

  const { data, error } = await db
    .from("demandas")
    .select("estado, contacts(phone_number)")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (error || !data) return { ok: false, erro: "Erro ao carregar a demanda." };
  const d = data as unknown as { estado: string; contacts: { phone_number: string | null } | null };

  if (d.estado !== "resolvida") return { ok: true, enviado: false, motivo: "nao_resolvida" };
  if (!d.contacts?.phone_number) return { ok: true, enviado: false, motivo: "sem_telefone" };
  if (!isWhatsappBRPlausivel(d.contacts.phone_number)) return { ok: true, enviado: false, motivo: "numero_invalido" };

  // Idempotência: o aviso de resolução já saiu? (manual e automático gravam o
  // mesmo evento, então o botão "Avisar cidadão" clicado antes também conta.)
  const { data: jaAvisado } = await db
    .from("pol_demanda_eventos")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", demandaId)
    .eq("tipo", "cidadao_avisado")
    .eq("descricao", AVISO_RESOLUCAO_DESCRICAO)
    .limit(1)
    .maybeSingle();
  if (jaAvisado) return { ok: true, enviado: false, motivo: "ja_avisado" };

  const r = await avisarCidadao(demandaId);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, enviado: true, protocolo: r.protocolo };
}

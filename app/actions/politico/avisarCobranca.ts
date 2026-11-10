"use server";

/**
 * "Avisar que estamos cobrando" (Gabinete) — follow-up de SATISFAÇÃO ao cidadão
 * quando a demanda dele VENCEU o prazo e o órgão ainda não respondeu. A mensagem
 * não é promessa; é transparência: "o setor não se manifestou, mas estamos
 * cobrando". É o gabinete dando satisfação sozinho — o diferencial de
 * relacionamento (concorrente avisa "resolvido" e some; aqui a gente volta
 * ANTES de resolver, pra pessoa saber que não foi esquecida).
 *
 * MODO ASSISTIDO: disparo MANUAL (um botão no detalhe da demanda), nunca sozinho
 * — o assessor controla o volume (preocupação do cliente: "mensagens demais").
 * O automático (interruptor + o cron `demanda-cobranca-watcher` que já detecta a
 * condição) fica como fast-follow.
 *
 * Reusa o caminho de envio do CRM (como `avisarCidadao`): resolve/abre a conversa
 * 1:1 no canal pronto e envia pelo handler de mensagens. Idempotente: uma
 * cobrança por demanda (o evento de histórico é a trava) — não martela a pessoa.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ApiError } from "@/lib/api/types";
import { demandaVencidaSemResposta, textoCobrancaCidadao } from "@/lib/politico/demanda-cobranca";

/** Descrição EXATA do evento — chave de idempotência (uma cobrança por demanda). */
const COBRANCA_AVISO_DESCRICAO = "Cidadão avisado que o gabinete está cobrando (prazo vencido)";

export type CobrancaResultado = { ok: true } | { ok: false; erro: string };

/** Mesmo crivo de `avisarCidadao`: +55 + DDD (11–99) + número local (8/9). */
function isWhatsappBRPlausivel(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+55") && (d.length === 12 || d.length === 13) && /^[1-9][0-9]$/.test(d.slice(2, 4));
}

interface DemandaCobrancaRow {
  id: string;
  estado: string;
  pol_gabinete: boolean | null;
  contact_id: string | null;
  assunto: string | null;
  aberta_em: string;
  pol_prazo_dias: number | null;
  pol_respondeu: boolean | null;
  contacts: { name: string | null; phone_number: string | null } | null;
}

export async function avisarCobrancaAoCidadao(demandaId: string): Promise<CobrancaResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data, error } = await db
    .from("demandas")
    .select("id, estado, pol_gabinete, contact_id, assunto, aberta_em, pol_prazo_dias, pol_respondeu, contacts(name, phone_number)")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (error) return { ok: false, erro: "Erro ao carregar a demanda." };
  if (!data) return { ok: false, erro: "Demanda não encontrada." };
  const d = data as unknown as DemandaCobrancaRow;

  if (!d.pol_gabinete) return { ok: false, erro: "Esta demanda não é do gabinete." };
  if (!d.contact_id) return { ok: false, erro: "Esta demanda não tem cidadão vinculado." };
  const contato = d.contacts;
  if (!contato?.phone_number) {
    return { ok: false, erro: "O cidadão não tem telefone cadastrado — não há como avisar por WhatsApp." };
  }
  if (!isWhatsappBRPlausivel(contato.phone_number)) {
    return {
      ok: false,
      erro: `O número ${contato.phone_number} não é um WhatsApp brasileiro válido (precisa de +55 + DDD). Corrija o cadastro do cidadão.`,
    };
  }

  // Só quando faz sentido: vencida, aberta e órgão sem resposta. A tela já
  // esconde o botão fora disso; a action reconfere pelo MESMO predicado.
  const cabe = demandaVencidaSemResposta({
    estado: d.estado,
    abertaEm: d.aberta_em,
    prazoDias: d.pol_prazo_dias,
    respondeu: d.pol_respondeu === true,
  });
  if (!cabe) {
    return { ok: false, erro: "Esta demanda não está vencida sem resposta — não cabe avisar que está cobrando." };
  }

  // Idempotência: uma cobrança por demanda. Não martela a pessoa.
  const { data: ja } = await db
    .from("pol_demanda_eventos")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", demandaId)
    .eq("tipo", "cidadao_avisado")
    .eq("descricao", COBRANCA_AVISO_DESCRICAO)
    .limit(1)
    .maybeSingle();
  if (ja) return { ok: false, erro: "O cidadão já foi avisado de que estamos cobrando esta demanda." };

  // Nome do parlamentar (da Identidade do Gabinete, nunca cravado).
  const { data: gabCfg } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const nomeParl = ((gabCfg?.nome_parlamentar as string | null) ?? "").trim();
  const primeiroNome = (contato.name ?? "").trim().split(/\s+/)[0] ?? "";

  // Abre a conversa no canal pronto.
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

  const corpo = textoCobrancaCidadao({
    primeiroNome,
    nomeParlamentar: nomeParl || null,
    assunto: d.assunto,
  });

  try {
    await sendMessageHandler(
      db,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId: randomUUID(), idioma: user.idioma },
      { conversation_id: conversationId, type: "text", body: corpo },
    );
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Falha no envio.";
    return { ok: false, erro: `Não foi possível enviar: ${msg}` };
  }

  await db.from("pol_demanda_eventos").insert({
    organization_id: org.orgId,
    demanda_id: demandaId,
    tipo: "cidadao_avisado",
    descricao: COBRANCA_AVISO_DESCRICAO,
    created_by: user.id,
  });

  return { ok: true };
}

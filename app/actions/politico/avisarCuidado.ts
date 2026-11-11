"use server";

/**
 * "Mandar um cuidado" (voltar a falar) — o follow-up AFETIVO ao cidadão depois
 * que a demanda dele foi RESOLVIDA. O gabinete volta pra saber como a pessoa
 * está, sem cobrar nada. É o OURO do relacionamento (ver `lib/politico/
 * cuidado-saude.ts` pros guardrails de saúde/LGPD/TSE).
 *
 * MODO ASSISTIDO: disparo MANUAL (um botão no detalhe da demanda), nunca sozinho
 * — saúde é dado sensível e "como está?" automático pra quem perdeu o parente é
 * desastre. O assessor revisa e confirma. Reusa o caminho de envio do CRM (como
 * `avisarCidadao`/`avisarCobranca`). Idempotente: um cuidado por demanda.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { openSharedContactConversation } from "@/lib/messaging/open-shared-contact-conversation";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ApiError } from "@/lib/api/types";
import { cabeCuidado, ehDemandaSaude, textoCuidadoSaude } from "@/lib/politico/cuidado-saude";

/** Descrição EXATA do evento — chave de idempotência (um cuidado por demanda). */
const CUIDADO_DESCRICAO = "Cidadão recebeu um cuidado do gabinete (voltar a falar)";

export type CuidadoResultado = { ok: true; saude: boolean } | { ok: false; erro: string };

/** Mesmo crivo de `avisarCidadao`: +55 + DDD (11–99) + número local (8/9). */
function isWhatsappBRPlausivel(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+55") && (d.length === 12 || d.length === 13) && /^[1-9][0-9]$/.test(d.slice(2, 4));
}

interface DemandaCuidadoRow {
  id: string;
  estado: string;
  pol_gabinete: boolean | null;
  contact_id: string | null;
  assunto: string | null;
  pol_tipo: string | null;
  pol_orgao_destino: string | null;
  fechada_em: string | null;
  contacts: { name: string | null; phone_number: string | null } | null;
}

export async function avisarCuidadoAoCidadao(demandaId: string, textoEditado?: string): Promise<CuidadoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data, error } = await db
    .from("demandas")
    .select("id, estado, pol_gabinete, contact_id, assunto, pol_tipo, pol_orgao_destino, fechada_em, contacts(name, phone_number)")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (error) return { ok: false, erro: "Erro ao carregar a demanda." };
  if (!data) return { ok: false, erro: "Demanda não encontrada." };
  const d = data as unknown as DemandaCuidadoRow;

  if (!d.pol_gabinete) return { ok: false, erro: "Esta demanda não é do gabinete." };
  if (!d.contact_id) return { ok: false, erro: "Esta demanda não tem cidadão vinculado." };
  const contato = d.contacts;
  if (!contato?.phone_number) {
    return { ok: false, erro: "O cidadão não tem telefone cadastrado — não há como mandar o cuidado por WhatsApp." };
  }
  if (!isWhatsappBRPlausivel(contato.phone_number)) {
    return { ok: false, erro: `O número ${contato.phone_number} não é um WhatsApp brasileiro válido (precisa de +55 + DDD).` };
  }

  // Só faz sentido depois de resolver (e há pouco tempo). A tela já esconde o
  // botão fora disso; a action reconfere.
  if (!cabeCuidado({ estado: d.estado, fechadaEm: d.fechada_em })) {
    return { ok: false, erro: "O cuidado é pra depois de resolver a demanda (e enquanto é recente)." };
  }

  // Idempotência: um cuidado por demanda. Não martela a pessoa.
  const { data: ja } = await db
    .from("pol_demanda_eventos")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", demandaId)
    .eq("tipo", "cidadao_avisado")
    .eq("descricao", CUIDADO_DESCRICAO)
    .limit(1)
    .maybeSingle();
  if (ja) return { ok: false, erro: "Já mandamos um cuidado pra esta pessoa nesta demanda." };

  const saude = ehDemandaSaude({ assunto: d.assunto, pol_tipo: d.pol_tipo, pol_orgao_destino: d.pol_orgao_destino });

  // Nome do parlamentar (Identidade do Gabinete, nunca cravado).
  const { data: gabCfg } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const nomeParl = ((gabCfg?.nome_parlamentar as string | null) ?? "").trim();
  const primeiroNome = (contato.name ?? "").trim().split(/\s+/)[0] ?? "";

  const admin = createAdminClient();
  let conversationId: string;
  try {
    const r = await openSharedContactConversation(admin, org.orgId, { contact_id: d.contact_id });
    conversationId = r.conversation_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "session_not_found") return { ok: false, erro: "Nenhum canal de WhatsApp conectado para enviar." };
    if (msg === "contact_personal") return { ok: false, erro: "Este contato está marcado como pessoal." };
    return { ok: false, erro: "Não consegui abrir a conversa do cidadão." };
  }

  // Modo assistido: se o assessor editou o texto no modal, usa o DELE; senão,
  // a sugestão automática. O texto é dado do humano autenticado — confiável.
  const sugerido = textoCuidadoSaude({ primeiroNome, nomeParlamentar: nomeParl || null, assunto: d.assunto, saude });
  const corpo = (textoEditado ?? "").trim() || sugerido;

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
    descricao: CUIDADO_DESCRICAO,
    created_by: user.id,
  });

  return { ok: true, saude };
}

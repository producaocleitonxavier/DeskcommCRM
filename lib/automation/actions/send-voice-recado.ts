/**
 * Ação `send_voice_recado` — "Recado em áudio na Voz do Mandato".
 *
 * Irmã de `send_whatsapp_message`/`send_ai_message`: MESMAS guardas de contato
 * (existe, não bloqueado, com telefone, sem opt-out), MESMA resolução de conversa
 * (`serviceForAutomation`) e MESMO throttle/janela do número. A diferença é que,
 * em vez de texto, ela gera um áudio na voz CLONADA do político (ElevenLabs) e o
 * envia como nota de voz — reusando o helper `enviarRecadoDeVozNaConversa`, o
 * mesmo caminho do botão manual "Avisar cidadão".
 *
 * TRAVA TSE (23.755/2026) é estrutural e vive no helper/`vozArmada`: sem clone +
 * consentimento assinado + ligado, NÃO gera nada — a ação devolve `skipped`
 * (voz_desarmada), nunca `failed`. Idem no silêncio eleitoral (`blackout`). Uma
 * regra ligada numa org sem voz armada simplesmente não faz nada, em vez de
 * encher a aba Atividade de erro.
 *
 * Primeiro uso: felicitação de aniversário (gatilho `contact.birthday`), mas o
 * `momento` é configurável pra outros usos de voz por regra no futuro.
 */
import { registerAction } from "@/lib/automation/actions";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import { serviceForAutomation } from "@/lib/atendimento/origem-automacao";
import { adiarAteAJanelaAbrir } from "@/lib/automation/janela-do-canal";
import { checkDailyLimit } from "@/lib/automation/throttle";
import { checarGuardasDeContato } from "@/lib/automation/guarda-do-contato";
import { enviarRecadoDeVozNaConversa } from "@/lib/voz/enviar-recado";
import { lerIdentidadeDoMandato } from "@/lib/politico/identidade-do-mandato";
import type { MomentoVoz } from "@/lib/voz/recado";

const TIPO = "send_voice_recado";

/** `momento` do config, com default seguro (aniversário é o 1º uso). */
function momentoDe(config: Record<string, unknown>): MomentoVoz {
  const m = config.momento;
  return m === "resolucao" || m === "encaminhamento" || m === "aniversario" ? m : "aniversario";
}

async function postponeUntil(ctx: ActionCtx, config: Record<string, unknown>): Promise<string | null> {
  const sessionId = typeof config.channel_session_id === "string" ? config.channel_session_id : null;
  if (!sessionId) return null; // config inválida falha no execute, não adia
  const foraDaJanela = await adiarAteAJanelaAbrir(ctx.admin, ctx.organizationId, sessionId);
  if (foraDaJanela) return foraDaJanela;
  const daily = await checkDailyLimit(ctx.admin, ctx.organizationId, sessionId);
  return daily.allowed ? null : (daily.retry_at ?? null);
}

async function execute(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail> {
  const sessionId = typeof config.channel_session_id === "string" ? config.channel_session_id : null;
  if (!sessionId) return { type: TIPO, status: "failed", error: "missing_config" };

  const guarda = checarGuardasDeContato(ctx);
  if (!guarda.ok) return { type: TIPO, status: "skipped", detail: { reason: guarda.reason } };
  const contact = guarda.contact;

  let boundary;
  try {
    boundary = await serviceForAutomation(ctx, contact.id, sessionId);
  } catch (error) {
    return { type: TIPO, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }

  // Primeiro nome de QUEM recebe (não do político). O contexto do evento
  // `contact.birthday` hidrata o contato inteiro (`select("*")`), então o nome
  // está aqui sem outra consulta.
  const nomeContato = (ctx.context.contact as { name?: string | null } | undefined)?.name ?? null;
  const primeiroNome = (nomeContato ?? "").trim().split(/\s+/)[0] || null;
  const idMandato = await lerIdentidadeDoMandato(ctx.admin, ctx.organizationId);

  const status = await enviarRecadoDeVozNaConversa({
    db: ctx.admin,
    admin: ctx.admin,
    orgId: ctx.organizationId,
    conversationId: boundary.conversation_id,
    momento: momentoDe(config),
    primeiroNome,
    nomeParlamentar: idMandato.nomeParlamentar,
    sendMeta: {
      organization_id: ctx.organizationId,
      serviceBoundary: boundary,
      proactiveContext: { organizationId: ctx.organizationId, contactId: contact.id },
      actor: { type: "webhook_source", id: ctx.ruleId },
    },
    requestIdBase: `rule:${ctx.ruleId}`,
    sessionId,
  });

  const detail = { conversation_id: boundary.conversation_id };
  if (status === "enviado") return { type: TIPO, status: "success", detail };
  // Voz desarmada ou blackout: a regra NÃO falhou — apenas não havia o que mandar.
  if (status === "voz_desarmada" || status === "blackout") {
    return { type: TIPO, status: "skipped", detail: { ...detail, reason: status } };
  }
  return { type: TIPO, status: "failed", error: "voz_falha_no_envio", detail };
}

registerAction({ type: TIPO, postponeUntil, execute });

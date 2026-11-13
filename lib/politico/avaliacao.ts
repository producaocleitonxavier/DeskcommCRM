/**
 * NOTA DO CIDADÃO — pedir e registrar.
 *
 * PEDIR: logo depois do aviso de resolução/encerramento sai uma SEGUNDA mensagem,
 * sem link, perguntando a nota de 1 a 5 (`perguntaDeAvaliacao`). Uma vez por
 * demanda: o marcador é `demandas.pol_avaliacao_token` (compare-and-set) — quem
 * gravou o marcador é quem envia, então dois cliques não perguntam duas vezes. Se
 * a mensagem NÃO sai (exceção OU mensagem devolvida como `failed`), o marcador é
 * desfeito: a próxima tentativa pode perguntar de novo.
 *
 * REGISTRAR: a pessoa responde só com o número. Só vira nota quando, juntos:
 *  (a) a mensagem É uma nota ("5", "nota 5", "cinco");
 *  (b) a ÚLTIMA mensagem que o gabinete mandou naquela conversa foi a pergunta,
 *      há no máximo 10 dias (`respostaEhDaPergunta`) — um "2" respondendo a outra
 *      pergunta qualquer não é nota;
 *  (c) há demanda daquele contato com a pergunta feita e sem resposta; com mais
 *      de uma, vale a da pergunta mais recente (`escolherDemandaDaNota`).
 *
 * Nunca lança; a avaliação jamais derruba o aviso nem a ingestão. Mas falha
 * agora é DITA (log + status), não engolida. Organização sempre de quem chama.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { logger } from "@/lib/logger";
import {
  NOTA_MAX,
  ROTULO_DA_NOTA,
  agradecimentoDaNota,
  escolherDemandaDaNota,
  lerNotaDaResposta,
  perguntaDeAvaliacao,
  perguntaEstaValendo,
  DIAS_PARA_RESPONDER,
  type UltimaSaida,
} from "@/lib/politico/avaliacao-texto";
import { enviarTextoNoCanal } from "@/lib/politico/enviar-material";
import { AVISO_IA_TEXTO } from "@/lib/voz/recado";

/** Descrição EXATA do registro de "pergunta enviada" — é por ela que se sabe de qual demanda é a nota. */
export const DESCRICAO_PERGUNTA_ENVIADA = "Pergunta de avaliação do atendimento enviada ao cidadão";

export async function pedirAvaliacaoDoAtendimento(p: {
  db: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  demandaId: string;
  conversationId: string;
  userId: string;
  idioma: "es" | "pt-BR" | undefined;
}): Promise<"enviada" | "ja_pedida" | "falhou"> {
  const aviso = (motivo: string) => logger.warn("[avaliacao] pergunta não saiu", { organization_id: p.orgId, demanda_id: p.demandaId, motivo: motivo.slice(0, 160) });
  try {
    const token = randomUUID().replace(/-/g, "");
    const { data: marcou, error } = await p.admin
      .from("demandas")
      .update({ pol_avaliacao_token: token })
      .eq("organization_id", p.orgId)
      .eq("id", p.demandaId)
      .is("pol_avaliacao_token", null)
      .is("pol_avaliacao_nota", null)
      .select("id")
      .maybeSingle();
    // Erro = coluna ainda não existe nesta instalação (ou banco fora): segue sem perguntar.
    if (error) { aviso(`marcar: ${error.message}`); return "falhou"; }
    if (!marcou) return "ja_pedida";

    const desfazer = () =>
      p.admin.from("demandas").update({ pol_avaliacao_token: null }).eq("organization_id", p.orgId).eq("id", p.demandaId).eq("pol_avaliacao_token", token);

    let falha: string | null = null;
    try {
      const msg = await sendMessageHandler(
        p.db,
        { organization_id: p.orgId, actor: { type: "user", id: p.userId }, requestId: randomUUID(), idioma: p.idioma },
        { conversation_id: p.conversationId, type: "text", body: perguntaDeAvaliacao() },
      );
      // O handler de envio DEVOLVE a mensagem como "failed" em vários casos (canal
      // parado, trava de teste, erro do WhatsApp) em vez de lançar.
      // "queued" também não conta: mensagem de usuário que fica na fila não é reenviada.
      const st = (msg as { status?: string } | null)?.status;
      if (st === "failed" || st === "queued") falha = `mensagem devolvida como ${st}`;
    } catch (err) {
      falha = err instanceof Error ? err.message : "erro no envio";
    }
    if (falha) {
      const { error: eDesf } = await desfazer();
      if (eDesf) aviso(`não consegui desfazer o marcador: ${eDesf.message}`);
      aviso(falha);
      return "falhou";
    }

    const { error: eEvt } = await p.db.from("pol_demanda_eventos").insert({
      organization_id: p.orgId,
      demanda_id: p.demandaId,
      tipo: "cidadao_avisado",
      descricao: DESCRICAO_PERGUNTA_ENVIADA,
      created_by: p.userId,
    });
    if (eEvt) logger.warn("[avaliacao] pergunta saiu, mas o registro no histórico falhou", { organization_id: p.orgId, demanda_id: p.demandaId, motivo: eEvt.message });
    return "enviada";
  } catch (err) {
    aviso(err instanceof Error ? err.message : "erro inesperado");
    return "falhou";
  }
}

export async function registrarNotaPorResposta(
  admin: SupabaseClient,
  e: { organizationId: string; contactId: string; conversationId: string | null; texto: string | null; canalId: string | null; recebidaEm: string | null },
): Promise<{ status: "ok" | "skipped" | "error"; detail: string }> {
  const nota = lerNotaDaResposta(e.texto);
  if (nota === null) return { status: "skipped", detail: "não é nota" };
  if (!e.conversationId) return { status: "skipped", detail: "sem conversa" };
  const org = e.organizationId;
  try {
    // (b) a última coisa que o gabinete disse nessa conversa foi a pergunta?
    // "Última" = a última ANTES da resposta chegar: se a IA respondeu ao "5" mais
    // rápido que este handler, a resposta dela não pode esconder a pergunta.
    const corte = e.recebidaEm && Number.isFinite(Date.parse(e.recebidaEm)) ? e.recebidaEm : new Date().toISOString();
    const { data: saida, error: eSaida } = await admin
      .from("messages")
      .select("body, created_at, status, type")
      .eq("organization_id", org)
      .eq("conversation_id", e.conversationId)
      .eq("direction", "outbound")
      .lte("created_at", corte)
      .order("created_at", { ascending: false })
      .limit(8);
    if (eSaida) return { status: "error", detail: `ler última saída: ${eSaida.message}` };
    if (!perguntaEstaValendo((saida ?? []) as UltimaSaida[], Date.parse(corte), [AVISO_IA_TEXTO.trim()])) {
      return { status: "skipped", detail: "a última mensagem do gabinete não foi a pergunta" };
    }

    // (c) qual demanda desse contato está com a pergunta em aberto?
    const { data: pend, error: ePend } = await admin
      .from("demandas")
      .select("id")
      .eq("organization_id", org)
      .eq("contact_id", e.contactId)
      .not("pol_avaliacao_token", "is", null)
      .is("pol_avaliacao_nota", null)
      .limit(20);
    // Coluna ausente (instalação sem a 9096) = não há o que fazer; qualquer outro erro é erro.
    if (ePend) return /column|schema cache|42703|PGRST204/i.test(`${ePend.code ?? ""} ${ePend.message ?? ""}`) ? { status: "skipped", detail: "sem coluna de avaliação" } : { status: "error", detail: `ler pendentes: ${ePend.message}` };
    const pendentes = ((pend ?? []) as { id: string }[]).map((d) => d.id);
    if (pendentes.length === 0) return { status: "skipped", detail: "sem avaliação pendente" };

    const desde = new Date(Date.parse(corte) - DIAS_PARA_RESPONDER * 24 * 60 * 60 * 1000).toISOString();
    const { data: evts, error: eEvts } = await admin
      .from("pol_demanda_eventos")
      .select("demanda_id, created_at")
      .eq("organization_id", org)
      .in("demanda_id", pendentes)
      .eq("descricao", DESCRICAO_PERGUNTA_ENVIADA)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(20);
    if (eEvts) return { status: "error", detail: `ler perguntas enviadas: ${eEvts.message}` };
    const alvo = escolherDemandaDaNota(pendentes, (evts ?? []) as { demanda_id: string; created_at: string }[]);
    if (!alvo) return { status: "skipped", detail: "mais de uma avaliação pendente e não dá para saber qual" };

    // Grava só se ainda está sem nota (duas mensagens "5" seguidas não regravam).
    const { data: gravou, error: eGrav } = await admin
      .from("demandas")
      .update({ pol_avaliacao_nota: nota, pol_avaliacao_em: new Date().toISOString() })
      .eq("organization_id", org)
      .eq("id", alvo)
      .is("pol_avaliacao_nota", null)
      .select("id")
      .maybeSingle();
    if (eGrav) {
      logger.warn("[avaliacao] nota recebida, mas não gravou", { organization_id: org, demanda_id: alvo, motivo: eGrav.message });
      return { status: "error", detail: `gravar nota: ${eGrav.message}` };
    }
    if (!gravou) return { status: "skipped", detail: "já avaliada" };

    const { error: eEvt } = await admin.from("pol_demanda_eventos").insert({
      organization_id: org,
      demanda_id: alvo,
      tipo: "nota",
      descricao: `Cidadão avaliou o atendimento: nota ${nota} de ${NOTA_MAX} (${ROTULO_DA_NOTA[nota] ?? ""})`,
    });
    if (eEvt) logger.warn("[avaliacao] nota gravada, mas o registro no histórico falhou", { organization_id: org, demanda_id: alvo, motivo: eEvt.message });

    let agradeceu = false;
    if (e.canalId) {
      const r = await enviarTextoNoCanal(admin, {
        organizationId: org,
        contactId: e.contactId,
        canalId: e.canalId,
        texto: agradecimentoDaNota(nota),
        rotulo: "avaliacao-agradecimento",
      });
      agradeceu = r.enviou;
      if (!r.enviou) logger.warn("[avaliacao] nota gravada, mas o agradecimento não saiu", { organization_id: org, demanda_id: alvo, motivo: r.erro ?? "?" });
    }
    return { status: "ok", detail: `nota ${nota}${agradeceu ? "" : " (sem agradecimento)"}` };
  } catch (err) {
    return { status: "error", detail: err instanceof Error ? err.message.slice(0, 120) : "?" };
  }
}

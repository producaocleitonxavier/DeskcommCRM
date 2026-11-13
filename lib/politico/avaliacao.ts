/**
 * NOTA DO CIDADÃO — pedir e registrar.
 *
 * PEDIR: logo depois do aviso de resolução/encerramento sai uma SEGUNDA mensagem,
 * sem link, perguntando a nota de 1 a 5 (`perguntaDeAvaliacao`). Uma vez por
 * demanda: o marcador é `demandas.pol_avaliacao_token` (compare-and-set) — quem
 * gravou o token é quem envia, então dois cliques não perguntam duas vezes.
 *
 * REGISTRAR: a pessoa responde só com o número. O handler de `message.received`
 * chama `registrarNotaPorResposta`, que só age quando (a) a mensagem É uma nota e
 * (b) aquele contato tem uma avaliação PEDIDA e ainda sem resposta, recente. Fora
 * disso é no-op — "5" numa conversa qualquer não vira nota.
 *
 * FAIL-SOFT nos dois lados: nunca lança; a avaliação jamais derruba o aviso nem a
 * ingestão da mensagem. Organização sempre de quem chama (sessão ou evento).
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { logger } from "@/lib/logger";
import { NOTA_MAX, ROTULO_DA_NOTA, agradecimentoDaNota, lerNotaDaResposta, perguntaDeAvaliacao } from "@/lib/politico/avaliacao-texto";
import { enviarTextoNoCanal } from "@/lib/politico/enviar-material";

/** Depois disso a pergunta "venceu": um número solto não é mais lido como nota. */
export const DIAS_PARA_RESPONDER = 10;

export async function pedirAvaliacaoDoAtendimento(p: {
  db: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  demandaId: string;
  conversationId: string;
  userId: string;
  idioma: "es" | "pt-BR" | undefined;
}): Promise<"enviada" | "ja_pedida" | "falhou"> {
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
    if (error) return "falhou";
    if (!marcou) return "ja_pedida";

    try {
      await sendMessageHandler(
        p.db,
        { organization_id: p.orgId, actor: { type: "user", id: p.userId }, requestId: randomUUID(), idioma: p.idioma },
        { conversation_id: p.conversationId, type: "text", body: perguntaDeAvaliacao() },
      );
    } catch (err) {
      // Não saiu: desfaz o marcador para a próxima tentativa poder perguntar.
      await p.admin.from("demandas").update({ pol_avaliacao_token: null }).eq("organization_id", p.orgId).eq("id", p.demandaId).eq("pol_avaliacao_token", token);
      logger.warn("[avaliacao] pergunta não saiu", { organization_id: p.orgId, detail: err instanceof Error ? err.message.slice(0, 120) : "?" });
      return "falhou";
    }

    await p.db.from("pol_demanda_eventos").insert({
      organization_id: p.orgId,
      demanda_id: p.demandaId,
      tipo: "cidadao_avisado",
      descricao: "Pergunta de avaliação do atendimento enviada ao cidadão",
      created_by: p.userId,
    });
    return "enviada";
  } catch {
    return "falhou";
  }
}

export async function registrarNotaPorResposta(
  admin: SupabaseClient,
  e: { organizationId: string; contactId: string; texto: string | null; canalId: string | null },
): Promise<{ status: "ok" | "skipped" | "error"; detail: string }> {
  const nota = lerNotaDaResposta(e.texto);
  if (nota === null) return { status: "skipped", detail: "não é nota" };
  try {
    const { data: pendentes, error } = await admin
      .from("demandas")
      .select("id, fechada_em, updated_at")
      .eq("organization_id", e.organizationId)
      .eq("contact_id", e.contactId)
      .not("pol_avaliacao_token", "is", null)
      .is("pol_avaliacao_nota", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) return { status: "skipped", detail: "sem coluna de avaliação" };
    const limite = Date.now() - DIAS_PARA_RESPONDER * 24 * 60 * 60 * 1000;
    const alvo = ((pendentes ?? []) as { id: string; fechada_em: string | null; updated_at: string | null }[]).find((d) => {
      const quando = Date.parse(d.fechada_em ?? d.updated_at ?? "");
      return Number.isFinite(quando) && quando >= limite;
    });
    if (!alvo) return { status: "skipped", detail: "sem avaliação pendente" };

    // Grava só se ainda está sem nota (duas mensagens "5" seguidas não regravam).
    const { data: gravou } = await admin
      .from("demandas")
      .update({ pol_avaliacao_nota: nota, pol_avaliacao_em: new Date().toISOString() })
      .eq("organization_id", e.organizationId)
      .eq("id", alvo.id)
      .is("pol_avaliacao_nota", null)
      .select("id")
      .maybeSingle();
    if (!gravou) return { status: "skipped", detail: "já avaliada" };

    await admin.from("pol_demanda_eventos").insert({
      organization_id: e.organizationId,
      demanda_id: alvo.id,
      tipo: "nota",
      descricao: `Cidadão avaliou o atendimento: nota ${nota} de ${NOTA_MAX} (${ROTULO_DA_NOTA[nota] ?? ""})`,
    });

    if (e.canalId) {
      await enviarTextoNoCanal(admin, {
        organizationId: e.organizationId,
        contactId: e.contactId,
        canalId: e.canalId,
        texto: agradecimentoDaNota(nota),
        rotulo: "avaliacao-agradecimento",
      });
    }
    return { status: "ok", detail: `nota ${nota}` };
  } catch (err) {
    return { status: "error", detail: err instanceof Error ? err.message.slice(0, 120) : "?" };
  }
}

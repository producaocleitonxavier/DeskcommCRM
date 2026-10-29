/**
 * DRIP MENSAL DE ENGAJAMENTO — relacionamento de longo prazo (organizar 2027).
 *
 * Quem GRADUA por engajamento (chega a simpatizante) entra num drip mensal: um
 * toque por mês, com espera IMUNE à resposta (a cadência não é cancelada se a
 * pessoa escrever — o atendimento responde por fora). Reusa o motor de follow-up
 * (`montarFluxoDripMensal` + `enrollFollowupFlow`), não um sender novo.
 *
 * Textos nascem GENÉRICOS (rascunho) e compliance-safe: nada de promessa, nada de
 * pedir voto, nada de favor-por-apoio (Lei 9.504/97). O gabinete edita no canvas.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { logger } from "@/lib/logger";
import { lerEventosEnvioConfig, estaArmada } from "@/lib/politico/eventos-envio/config";
import type { ToqueDrip } from "@/lib/politico/eventos-envio/fluxos";

/** Nome do pointer do drip de engajamento (único por org). */
export const NOME_DRIP_ENGAJAMENTO = "Drip de Engajamento";

/**
 * Toques mensais padrão (rascunho, o gabinete personaliza). SEM variável
 * (`{{...}}` não interpola no modo texto) e SEM promessa/pedido de voto.
 */
export const TOQUES_DRIP_ENGAJAMENTO: ToqueDrip[] = [
  {
    rotulo: "Mês 1 · Boas-vindas",
    texto:
      "Oi! Aqui é do nosso gabinete 🙏 Que bom ter você por perto. " +
      "De vez em quando vou te mandar novidades úteis — o que está acontecendo no seu bairro " +
      "e o trabalho do mandato. Qualquer coisa, é só me chamar por aqui!",
  },
  {
    rotulo: "Mês 2 · Conteúdo útil",
    texto:
      "Olá! Uma dica do mês: converse com seus filhos sobre o que eles fazem online e " +
      "conheça os apps que eles usam. Proteger começa pelo diálogo. 💬 " +
      "Se quiser materiais sobre o tema, é só pedir aqui.",
  },
  {
    rotulo: "Mês 3 · Prestação de contas",
    texto:
      "Oi! Passando pra te manter por dentro do trabalho do gabinete — fiscalização, " +
      "demandas do bairro e as pautas de proteção à infância e à família. " +
      "Tem algo na sua região que você acha que a gente deveria olhar? Me conta por aqui.",
  },
];

/**
 * Inscreve um lead GRADUADO (chegou a simpatizante por engajamento) no drip
 * mensal — reusando o drip publicado do motor de eventos (config/arming/pointer
 * já prontos). DORMENTE-SEGURO: se a máquina não está armada (sem número
 * dedicado / `ativo=false`), não faz nada. Fixa o número dedicado. Idempotente
 * (um follow-up ativo por lead → `conflict` é no-op). Best-effort, nunca lança.
 */
export async function inscreverGraduadoNoDrip(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<{ inscrito: boolean; motivo: string }> {
  try {
    const cfg = await lerEventosEnvioConfig(admin, organizationId);
    if (!estaArmada(cfg)) return { inscrito: false, motivo: "dormente" };
    const sessionId = cfg.channelSessionId!;
    const pointerId = cfg.dripPointerId;
    if (!pointerId) return { inscrito: false, motivo: "drip_sem_fluxo" };

    const r = await enrollFollowupFlow(admin, {
      organizationId,
      pointerId,
      contactId,
      actorUserId: null,
      requestId: randomUUID(),
      resolveServiceBoundary: () => beginServiceAtOrigin(admin, organizationId, contactId, sessionId),
    });
    if (!r.ok) {
      if (r.code !== "conflict") logger.warn("[drip] enroll do graduado falhou", { code: r.code, message: r.message });
      return { inscrito: false, motivo: r.code };
    }
    return { inscrito: true, motivo: "ok" };
  } catch (err) {
    logger.warn("[drip] inscrição falhou (segue normal)", { organization_id: organizationId, detail: err instanceof Error ? err.message.slice(0, 120) : "?" });
    return { inscrito: false, motivo: "excecao" };
  }
}

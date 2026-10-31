/**
 * GET|POST /api/v1/cron/boletim-semanal — CRON semanal da Inteligência.
 *
 * Mantém o Boletim Semanal fresco: para CADA org com monitoramento configurado
 * (intel_monitor_config), atualiza a escuta (imprensa RSS + comentários IG),
 * reclassifica por IA e regenera os sinais (Alertas/Decisão/Adversários). Assim,
 * quando o mandato abre o Boletim/Opinião Pública, os dados da semana já estão lá
 * — o "ritmo recorrente" que nos diferencia do concorrente (tempo real caro).
 *
 * NÃO gera nem persiste o PDF do boletim (isso é leitura sob demanda hoje); a
 * persistência de histórico + entrega por canal fica como próximo passo (precisa
 * de tabela de histórico + decisão de canal).
 *
 * Auth: Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET (autorizaCron), fail-closed.
 * Roda para TODAS as orgs (sem organization_id no escopo). Idempotente: a escuta
 * dedupe por URL, então reexecução no mesmo dia não duplica menções.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { orgsComMonitor, lerConfigMonitorAdmin, atualizarMencoesDaOrg } from "@/app/actions/politico/opiniaoPublica";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Escuta de várias orgs pode levar mais que o default; dá folga.
export const maxDuration = 300;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("unauthorized", "Cron não autorizado.", 401, { requestId });

  const admin = createAdminClient();
  const orgs = await orgsComMonitor(admin);

  let novasTotais = 0;
  let orgsComErro = 0;
  const resultados: { org: string; novas: number; erro?: string }[] = [];
  for (const orgId of orgs) {
    try {
      const cfg = await lerConfigMonitorAdmin(admin, orgId);
      const { novas } = await atualizarMencoesDaOrg(admin, orgId, cfg);
      novasTotais += novas;
      resultados.push({ org: orgId, novas });
    } catch (e) {
      orgsComErro += 1;
      resultados.push({ org: orgId, novas: 0, erro: e instanceof Error ? e.message : "erro" });
      logger.error("[cron boletim-semanal] falha numa org", { orgId, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  logger.info("[cron boletim-semanal] concluído", { orgs: orgs.length, novasTotais, orgsComErro });
  return ok(
    { orgs: orgs.length, novasTotais, orgsComErro, resultados },
    { status: 200, headers: { "x-request-id": requestId } },
  );
}

export const GET = handle;
export const POST = handle;

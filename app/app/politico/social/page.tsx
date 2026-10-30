/**
 * /app/politico/social — Opinião Pública (Pilar 2: escuta social).
 *
 * Server: auth + config de monitoramento + resumo + menções. A ingestão
 * (RSS da imprensa + classificação por IA) roda no client via server action.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { obterConfigMonitor, resumoOpiniao, listarMencoes } from "@/app/actions/politico/opiniaoPublica";
import OpiniaoPublicaClient from "./_social-client";
import MonitoramentoTabs from "@/components/politico/monitoramento-tabs";

export const dynamic = "force-dynamic";

export default async function OpiniaoPublicaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const [config, resumo, mencoes] = await Promise.all([obterConfigMonitor(), resumoOpiniao(), listarMencoes(50)]);

  return (
    <>
      <MonitoramentoTabs active="escuta" />
      <OpiniaoPublicaClient config={config} resumo={resumo} mencoes={mencoes} />
    </>
  );
}

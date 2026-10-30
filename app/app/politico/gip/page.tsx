/**
 * /app/politico/gip — "Pergunte ao GIP": assistente de inteligência em linguagem
 * natural. Server: auth + contexto (mandato + cidade) para as sugestões. A
 * conversa e as chamadas de ferramenta vivem no client via server action.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { obterMandatoTse } from "@/app/actions/politico/obras-actions";
import { obterConfigMonitor } from "@/app/actions/politico/opiniaoPublica";
import GipClient from "./_gip-client";

export const dynamic = "force-dynamic";

export default async function GipPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const [mandato, cfg] = await Promise.all([obterMandatoTse(), obterConfigMonitor()]);

  return <GipClient mandatoNome={mandato?.nome ?? null} cidade={cfg.cidade} />;
}

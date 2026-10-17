/**
 * /app/politico/identidade — Identidade do gabinete (timbre dos ofícios).
 *
 * Server component: auth + leitura da identidade (com URLs assinadas das
 * imagens). O formulário (client) grava via server actions e a rota de upload.
 *
 * Acesso: manager+ (configuração do gabinete).
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { obterIdentidade } from "@/app/actions/politico/gabinete-identidade";
import IdentidadeClient from "./_client";

export const dynamic = "force-dynamic";

export default async function IdentidadeGabinetePage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const identidade = await obterIdentidade();
  return <IdentidadeClient inicial={identidade} />;
}

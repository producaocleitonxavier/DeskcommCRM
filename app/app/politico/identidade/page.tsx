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
import PageTabs from "@/components/politico/page-tabs";

const GABINETE_CFG_TABS = [
  { id: "transparencia", label: "Portal da Transparência", href: "/app/politico/transparencia" },
  { id: "identidade", label: "Identidade", href: "/app/politico/identidade" },
];

export const dynamic = "force-dynamic";

export default async function IdentidadeGabinetePage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const identidade = await obterIdentidade();
  return (
    <>
      <PageTabs abas={GABINETE_CFG_TABS} active="identidade" maxW="840px" />
      <IdentidadeClient inicial={identidade} />
    </>
  );
}

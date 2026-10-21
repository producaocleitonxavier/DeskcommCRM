/**
 * /app/politico/transparencia — Gestão do Portal da Transparência (Gabinete).
 *
 * O operador liga/desliga o portal público do mandato, copia o link para
 * divulgar e vê quantas obras/emendas já estão públicas. A vitrine em si é
 * /transparencia/<orgId> (pública, sem auth).
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { obterPortalConfig } from "@/app/actions/politico/transparencia-actions";
import TransparenciaClient from "./_client";
import PageTabs from "@/components/politico/page-tabs";

const GABINETE_CFG_TABS = [
  { id: "transparencia", label: "Portal da Transparência", href: "/app/politico/transparencia" },
  { id: "identidade", label: "Identidade", href: "/app/politico/identidade" },
];

export const dynamic = "force-dynamic";

export default async function TransparenciaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const cfg = await obterPortalConfig();
  if (!cfg) redirect("/app/onboarding");

  return (
    <>
      <PageTabs abas={GABINETE_CFG_TABS} active="transparencia" maxW="840px" />
      <TransparenciaClient config={cfg} />
    </>
  );
}

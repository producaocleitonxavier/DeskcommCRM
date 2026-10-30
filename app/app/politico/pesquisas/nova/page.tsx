/**
 * /app/politico/pesquisas/nova — criar pesquisa (Fase 1). Server: auth manager+.
 */
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import NovaPesquisaClient from "./_nova-client";

export const dynamic = "force-dynamic";

export default async function NovaPesquisaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");
  return <NovaPesquisaClient />;
}

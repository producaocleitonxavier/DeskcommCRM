/**
 * /app/politico/projetos-lei/novo — cadastrar projeto de lei (Gabinete).
 * Server component: auth. O form (client) grava em pol_projetos_lei via Supabase.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovoProjetoForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovoProjetoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  return <NovoProjetoForm orgId={org.orgId} />;
}

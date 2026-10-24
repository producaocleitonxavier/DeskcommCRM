/**
 * /app/politico/locais/novo — cadastrar local (e, opcional, o evento nele).
 * Server component: auth. O form (client) grava via server action.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovoLocalForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovoLocalPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  return <NovoLocalForm />;
}

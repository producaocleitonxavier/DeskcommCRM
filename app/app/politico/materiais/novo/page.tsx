/**
 * /app/politico/materiais/novo — cadastrar material (Biblioteca).
 * Server component: auth. O form (client) grava em pol_materiais via server action.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovoMaterialForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovoMaterialPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  return <NovoMaterialForm />;
}

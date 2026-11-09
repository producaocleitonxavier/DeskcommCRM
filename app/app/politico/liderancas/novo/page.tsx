/**
 * /app/politico/liderancas/novo — cadastrar liderança (Gabinete, War Room 2.0)
 *
 * Server component: auth + territórios para o select. O formulário (client)
 * liga a liderança a um contato da base (contact_id, obrigatório) e grava em
 * pol_liderancas via Supabase (RLS).
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovaLiderancaForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovaLiderancaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  return <NovaLiderancaForm orgId={org.orgId} />;
}

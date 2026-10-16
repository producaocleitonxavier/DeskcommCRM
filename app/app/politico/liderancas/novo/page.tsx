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
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovaLiderancaForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovaLiderancaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data } = await db
    .from("pol_territories")
    .select("id, name, state_code")
    .eq("organization_id", org.orgId)
    .order("name")
    .limit(600);

  const territorios = ((data ?? []) as { id: string; name: string; state_code: string | null }[]).map((t) => ({
    id: t.id,
    nome: t.state_code ? `${t.name} · ${t.state_code}` : t.name,
  }));

  return <NovaLiderancaForm orgId={org.orgId} territorios={territorios} />;
}

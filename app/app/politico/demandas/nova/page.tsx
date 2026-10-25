/**
 * /app/politico/demandas/nova — criar demanda (Gabinete, War Room 2.0)
 *
 * Server component: auth + busca de territórios e lideranças para os selects.
 * O formulário (client) grava direto em `demandas` via Supabase (RLS), ligando
 * a demanda a um cidadão existente (contact_id) da base.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";
import NovaDemandaForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovaDemandaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data: membrosData } = await db
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", org.orgId)
    .is("revoked_at", null);
  const membrosRes = { data: membrosData };

  // Assessores = membros ativos da organização. Nome via service role (cai para
  // o papel + prefixo do id quando não resolve). Ordena por nome.
  const membros = (membrosRes.data ?? []) as { user_id: string; role: string }[];
  const nomes = await nomesDosAtendentes(membros.map((m) => m.user_id));
  const assessores = membros
    .map((m) => ({
      id: m.user_id,
      nome: nomes.get(m.user_id) ?? `${m.user_id.slice(0, 8)} · ${m.role}`,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return <NovaDemandaForm orgId={org.orgId} assessores={assessores} />;
}

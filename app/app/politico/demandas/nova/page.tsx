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
  const [terrRes, lidRes, membrosRes] = await Promise.all([
    db.from("pol_territories").select("id, name, state_code").eq("organization_id", org.orgId).order("name").limit(600),
    db.from("pol_liderancas").select("id, nome, cidade").eq("organization_id", org.orgId).eq("status", "ativo").order("nome").limit(500),
    db.from("user_organizations").select("user_id, role").eq("organization_id", org.orgId).is("revoked_at", null),
  ]);

  const territorios = ((terrRes.data ?? []) as { id: string; name: string; state_code: string | null }[]).map((t) => ({
    id: t.id,
    nome: t.state_code ? `${t.name} · ${t.state_code}` : t.name,
  }));
  const liderancas = ((lidRes.data ?? []) as { id: string; nome: string; cidade: string | null }[]).map((l) => ({
    id: l.id,
    nome: l.cidade ? `${l.nome} · ${l.cidade}` : l.nome,
  }));

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

  return <NovaDemandaForm orgId={org.orgId} territorios={territorios} liderancas={liderancas} assessores={assessores} />;
}

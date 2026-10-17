/**
 * /app/politico/emendas/nova — cadastrar emenda (Gabinete, War Room 2.0)
 *
 * Server component: auth + territórios e lideranças para os selects. O form
 * (client) grava em pol_emendas via Supabase (RLS); valores entram em R$ e são
 * convertidos para _cents.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovaEmendaForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovaEmendaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [terrRes, lidRes] = await Promise.all([
    db.from("pol_territories").select("id, name, state_code").eq("organization_id", org.orgId).order("name").limit(600),
    db.from("pol_liderancas").select("id, nome, cidade").eq("organization_id", org.orgId).eq("status", "ativo").order("nome").limit(500),
  ]);

  const territorios = ((terrRes.data ?? []) as { id: string; name: string; state_code: string | null }[]).map((t) => ({
    id: t.id,
    nome: t.state_code ? `${t.name} · ${t.state_code}` : t.name,
  }));
  const liderancas = ((lidRes.data ?? []) as { id: string; nome: string; cidade: string | null }[]).map((l) => ({
    id: l.id,
    nome: l.cidade ? `${l.nome} · ${l.cidade}` : l.nome,
  }));

  return <NovaEmendaForm orgId={org.orgId} territorios={territorios} liderancas={liderancas} />;
}

/**
 * /app/politico/agenda/[id] — detalhe/edição de um compromisso (Gabinete).
 * Server: auth + busca + territórios/lideranças. Interação em ./_detalhe-client.
 *
 * Acesso: manager+
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import DetalheCompromissoClient, { type CompromissoDetalhe } from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function CompromissoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [cRes, terrRes, lidRes] = await Promise.all([
    db
      .from("pol_agenda")
      .select("id, titulo, descricao, tipo, data_inicio, data_fim, dia_inteiro, status, local, municipio, territory_id, lideranca_id")
      .eq("organization_id", org.orgId)
      .eq("id", id)
      .maybeSingle(),
    db.from("pol_territories").select("id, name, state_code").eq("organization_id", org.orgId).order("name").limit(600),
    db.from("pol_liderancas").select("id, nome, cidade").eq("organization_id", org.orgId).eq("status", "ativo").order("nome").limit(500),
  ]);

  if (!cRes.data) notFound();

  const territorios = ((terrRes.data ?? []) as { id: string; name: string; state_code: string | null }[]).map((t) => ({
    id: t.id,
    nome: t.state_code ? `${t.name} · ${t.state_code}` : t.name,
  }));
  const liderancas = ((lidRes.data ?? []) as { id: string; nome: string; cidade: string | null }[]).map((l) => ({
    id: l.id,
    nome: l.cidade ? `${l.nome} · ${l.cidade}` : l.nome,
  }));

  return <DetalheCompromissoClient compromisso={cRes.data as unknown as CompromissoDetalhe} territorios={territorios} liderancas={liderancas} />;
}

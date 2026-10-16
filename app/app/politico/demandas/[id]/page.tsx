/**
 * /app/politico/demandas/[id] — detalhe e edição de uma demanda (Gabinete).
 *
 * Server component: auth + busca da demanda (com cidadão), territórios e
 * lideranças para os selects de edição. A interação (editar, transições de
 * estado, encaminhamento) vive em ./_detalhe-client.
 *
 * Acesso: manager+
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import DetalheDemandaClient, { type DemandaDetalhe } from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function DemandaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [demRes, terrRes, lidRes] = await Promise.all([
    db
      .from("demandas")
      .select(
        "id, assunto, estado, origem, pol_tipo, pol_prioridade, pol_orgao_destino, pol_encaminhamento_ia, pol_territory_id, pol_lideranca_id, dono_kind, aberta_em, prazo_em, desfecho, fechada_em, created_at, updated_at, contacts(name, phone_number)",
      )
      .eq("organization_id", org.orgId)
      .eq("id", id)
      .maybeSingle(),
    db.from("pol_territories").select("id, name, state_code").eq("organization_id", org.orgId).order("name").limit(600),
    db.from("pol_liderancas").select("id, nome, cidade").eq("organization_id", org.orgId).eq("status", "ativo").order("nome").limit(500),
  ]);

  if (!demRes.data) notFound();

  const territorios = ((terrRes.data ?? []) as { id: string; name: string; state_code: string | null }[]).map((t) => ({
    id: t.id,
    nome: t.state_code ? `${t.name} · ${t.state_code}` : t.name,
  }));
  const liderancas = ((lidRes.data ?? []) as { id: string; nome: string; cidade: string | null }[]).map((l) => ({
    id: l.id,
    nome: l.cidade ? `${l.nome} · ${l.cidade}` : l.nome,
  }));

  return (
    <DetalheDemandaClient
      demanda={demRes.data as unknown as DemandaDetalhe}
      territorios={territorios}
      liderancas={liderancas}
    />
  );
}

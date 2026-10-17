/**
 * /app/politico/projetos-lei/[id] — detalhe, edição e timeline de tramitação.
 * Server: auth + busca do projeto. Interação em ./_detalhe-client.
 *
 * Acesso: manager+
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import DetalheProjetoClient, { type ProjetoDetalhe } from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function ProjetoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data } = await db
    .from("pol_projetos_lei")
    .select(
      "id, numero, tipo, esfera, titulo, ementa, descricao, tema, url_oficial, autor_mandatario, coautores, data_apresentacao, data_ultima_movimentacao, status, comissao_atual, relator, prioridade, alinhamento_campanha, temas_campanha, alertas_ativos",
    )
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return <DetalheProjetoClient projeto={data as unknown as ProjetoDetalhe} />;
}

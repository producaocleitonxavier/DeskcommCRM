/**
 * /app/politico/projetos-lei — Projetos de Lei (War Room 2.0)
 *
 * Server: auth + fetch (pol_projetos_lei). Visual em ./_projetos-client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import ProjetosClient, { type ProjetoItem } from "./_projetos-client";

export const dynamic = "force-dynamic";

const CONCLUIDOS = ["aprovado", "vetado", "promulgado", "arquivado", "retirado"];

export default async function ProjetosLeiPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data } = await db
    .from("pol_projetos_lei")
    .select(
      "id, numero, tipo, esfera, titulo, status, prioridade, autor_mandatario, alinhamento_campanha, data_apresentacao, data_ultima_movimentacao, comissao_atual",
    )
    .eq("organization_id", org.orgId)
    .order("data_ultima_movimentacao", { ascending: false, nullsFirst: false })
    .limit(100);

  const projetos: ProjetoItem[] = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    numero: String(p.numero ?? ""),
    tipo: String(p.tipo ?? ""),
    esfera: String(p.esfera ?? ""),
    titulo: String(p.titulo ?? ""),
    status: String(p.status ?? "rascunho"),
    comissao: (p.comissao_atual as string | null) ?? null,
    autorMandatario: Boolean(p.autor_mandatario),
    alinhamento: Boolean(p.alinhamento_campanha),
    dataApresentacao: (p.data_apresentacao as string | null) ?? null,
    dataUltimaMov: (p.data_ultima_movimentacao as string | null) ?? null,
  }));

  const kpis = {
    emTramitacao: projetos.filter((p) => !CONCLUIDOS.includes(p.status)).length,
    deAutoria: projetos.filter((p) => p.autorMandatario).length,
    alinhados: projetos.filter((p) => p.alinhamento).length,
    aprovados: projetos.filter((p) => ["aprovado", "promulgado"].includes(p.status)).length,
  };

  return <ProjetosClient kpis={kpis} projetos={projetos} ehAdmin={ROLE_RANK[org.role] >= ROLE_RANK.admin} />;
}

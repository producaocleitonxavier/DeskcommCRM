import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { listarOrigensEGrupos } from "@/lib/politico/origens-grupos";
import { NovaCampanha } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo disparo" };

export default async function NovaCampanhaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  // Materiais ativos (biblioteca) para a entrega na resposta.
  const { data: mats } = await db
    .from("pol_materiais")
    .select("id, titulo, tipo")
    .eq("organization_id", org.orgId)
    .eq("ativo", true)
    .order("titulo", { ascending: true });
  const materiais = (mats ?? []) as { id: string; titulo: string; tipo: string }[];

  // Origens DINÂMICAS (camaleão): distintas de contacts.source, com contagem,
  // já organizadas pelos "Grupos de origem" do mandato. Origem nova aparece
  // sozinha; o seletor mostra agrupado (grupos primeiro, "A classificar" por
  // último). O `value` continua sendo o source cru que o filtro manda.
  const { grupos, aClassificar, outrasPoucas } = await listarOrigensEGrupos(db, org.orgId);
  const origens = [
    ...grupos.flatMap((g) => g.origens.map((o) => ({ value: o.source, label: o.label, total: o.total, grupo: g.nome as string | null }))),
    ...aClassificar.map((o) => ({ value: o.source, label: o.label, total: o.total, grupo: null as string | null })),
    // Origens de 1-2 pessoas vão por último, num grupo "Outras origens", pra não
    // espalhar ruído no meio das que importam (origens de sistema já saíram no server).
    ...outrasPoucas.map((o) => ({ value: o.source, label: o.label, total: o.total, grupo: "Outras origens" as string | null })),
  ];

  // Cidades da base COM contatos (territory_id), para segmentar o disparo por
  // cidade — fecha o laço "ver no mapa de calor → disparar pra lá". Depende de
  // "Carimbar cidades" ter rodado (senão vem vazio e o seletor nem aparece).
  const { data: cids } = await db
    .from("pol_vw_mapa_oportunidades")
    .select("territory_id, name, total_leads")
    .eq("organization_id", org.orgId)
    .gt("total_leads", 0)
    .order("total_leads", { ascending: false })
    .limit(600);
  const cidades = ((cids ?? []) as { territory_id: string; name: string; total_leads: number }[]).map((c) => ({
    id: c.territory_id,
    name: c.name,
    total: c.total_leads,
  }));

  return <NovaCampanha materiais={materiais} origens={origens} cidades={cidades} />;
}

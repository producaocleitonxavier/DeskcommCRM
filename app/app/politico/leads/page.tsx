/**
 * /app/politico/leads — Pessoas (War Room 2.0)
 *
 * Server component: auth + fetch (pol_leads + contagens por etapa). O visual
 * (cards, filtros, paginação) vive em ./_leads-client, que usa componentes de
 * components/politico/ e ícones LucideIcon.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import LeadsClient from "./_leads-client";

export const dynamic = "force-dynamic";

const POR_PAGINA = 24;

const SUPPORT_LEVELS = ["novo_cadastro", "simpatizante", "apoiador", "militante", "voto_certo"] as const;

export interface LeadRow {
  id: string;
  support_level: string;
  temperature: string;
  political_score: number;
  territory_id: string | null;
  created_at: string;
  contacts: {
    name: string | null;
    phone_number: string | null;
    source: string | null;
    last_activity_at: string | null;
  } | null;
  pol_territories: { name: string } | null;
}

async function buscarLeads(
  organizationId: string,
  pagina: number,
  etapa?: string,
  busca?: string,
  temp?: string,
) {
  const db = await createClient();
  const offset = (pagina - 1) * POR_PAGINA;

  let query = db
    .from("pol_leads")
    .select(
      // contacts!contact_id: pol_leads tem 2 FKs para contacts (contact_id e
      // mobilizer_id); sem o hint o embed fica ambiguo (PGRST201) e a lista volta vazia.
      "id, support_level, temperature, political_score, territory_id, created_at, contacts!contact_id(name, phone_number, source, last_activity_at), pol_territories(name)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(offset, offset + POR_PAGINA - 1);

  if (etapa) query = query.eq("support_level", etapa);
  if (temp) query = query.eq("temperature", temp);
  if (busca) query = query.ilike("contacts.name", `%${busca}%`);

  const { data, count } = await query;
  return { leads: (data as unknown as LeadRow[]) ?? [], total: count ?? 0 };
}

async function contarPorEtapa(organizationId: string): Promise<Record<string, number>> {
  const db = await createClient();
  const counts: Record<string, number> = {};

  const { count: totalCount } = await db
    .from("pol_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  counts._total = totalCount ?? 0;

  await Promise.all(
    SUPPORT_LEVELS.map(async (lvl) => {
      const { count } = await db
        .from("pol_leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("support_level", lvl);
      counts[lvl] = count ?? 0;
    }),
  );

  return counts;
}

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const etapa = typeof params.etapa === "string" ? params.etapa : "";
  const busca = typeof params.busca === "string" ? params.busca : "";
  const temp = typeof params.temp === "string" ? params.temp : "";

  const [{ leads, total }, contagens] = await Promise.all([
    buscarLeads(org.orgId, pagina, etapa || undefined, busca || undefined, temp || undefined),
    contarPorEtapa(org.orgId),
  ]);

  return (
    <LeadsClient
      leads={leads}
      total={total}
      contagens={contagens}
      filtros={{ etapa, busca, temp, pagina }}
      porPagina={POR_PAGINA}
    />
  );
}

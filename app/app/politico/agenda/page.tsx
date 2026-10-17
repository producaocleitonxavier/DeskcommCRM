/**
 * /app/politico/agenda — Agenda do mandato (Gabinete, War Room 2.0)
 *
 * Server: auth + fetch de pol_agenda numa janela (−7d a +60d). O visual
 * (faixa de semana + lista do dia) vive em ./_agenda-client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import AgendaClient, { type Compromisso } from "./_agenda-client";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const de = new Date();
  de.setDate(de.getDate() - 7);
  de.setHours(0, 0, 0, 0);

  const db = await createClient();
  const { data } = await db
    .from("pol_agenda")
    .select("id, titulo, tipo, data_inicio, data_fim, dia_inteiro, status, local, municipio")
    .eq("organization_id", org.orgId)
    .gte("data_inicio", de.toISOString())
    .order("data_inicio", { ascending: true })
    .limit(500);

  return <AgendaClient compromissos={(data ?? []) as Compromisso[]} />;
}

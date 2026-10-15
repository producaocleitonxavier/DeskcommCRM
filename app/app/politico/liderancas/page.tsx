/**
 * /app/politico/liderancas — Gabinete Digital: Lideranças (War Room 2.0)
 *
 * Server component: auth + fetch (pol_liderancas, todos os status). O visual
 * (KPIs, aniversários, cards) vive em ./_liderancas-client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import LiderancasClient from "./_liderancas-client";

export const dynamic = "force-dynamic";

export interface Lideranca {
  id: string;
  nome: string;
  apelido: string | null;
  cargo: string | null;
  tipo: string;
  whatsapp: string | null;
  aniversario: string | null;
  cidade: string | null;
  bairro: string | null;
  leads_mobilizados: number;
  eventos_organizados: number;
  nivel_engajamento: string;
  status: string;
  ultimo_contato_em: string | null;
}

async function buscarLiderancas(organizationId: string): Promise<Lideranca[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_liderancas")
    .select(
      "id, nome, apelido, cargo, tipo, whatsapp, aniversario, cidade, bairro, leads_mobilizados, eventos_organizados, nivel_engajamento, status, ultimo_contato_em",
    )
    .eq("organization_id", organizationId)
    .order("status", { ascending: true })
    .order("nome", { ascending: true });

  return (data ?? []) as Lideranca[];
}

export default async function LiderancasPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const liderancas = await buscarLiderancas(org.orgId);

  return <LiderancasClient liderancas={liderancas} />;
}

"use server";

/**
 * Bairros de uma cidade (drill-down da lista "Onde está sua base"). Puxados SOB
 * DEMANDA e só os que TÊM cadastro (a função 9061 agrega o que existe) — nunca
 * pré-popula bairro. `organization_id` sempre de resolveActiveOrg (nunca do input).
 */
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export interface BairroRow {
  nome: string;
  total: number;
}

export async function bairrosDaCidade(cidade: string): Promise<BairroRow[]> {
  const termo = (cidade ?? "").trim();
  if (!termo) return [];
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db.rpc("pol_mapa_base_bairros", { p_org: org.orgId, p_cidade: termo });
  return ((data ?? []) as { bairro: string; total: number | string }[]).map((r) => ({
    nome: r.bairro,
    total: Number(r.total) || 0,
  }));
}

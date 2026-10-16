/**
 * /app/politico/funil — Funil político (War Room 2.0)
 *
 * Server component: auth + fetch (pol_leads por estágio + pol_funnel_transitions).
 * O visual (funil hero, KPIs, tabela) vive em ./_funil-client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import FunilClient from "./_funil-client";

export const dynamic = "force-dynamic";

const ESTAGIOS = ["novo_cadastro", "simpatizante", "apoiador", "militante", "voto_certo"] as const;

export interface TransicaoRow {
  id: string;
  from_stage: string;
  to_stage: string;
  created_at: string;
  reason: string | null;
  changed_by: string | null;
  contacts: { name: string | null } | null;
}

async function buscarContagemPorEstagio(organizationId: string): Promise<Record<string, number>> {
  const db = await createClient();
  const { data } = await db
    .from("pol_leads")
    .select("support_level")
    .eq("organization_id", organizationId);

  const contagem: Record<string, number> = {};
  for (const e of ESTAGIOS) contagem[e] = 0;
  for (const row of data ?? []) {
    const lvl = (row as { support_level: string }).support_level;
    contagem[lvl] = (contagem[lvl] ?? 0) + 1;
  }
  return contagem;
}

async function buscarTransicoesRecentes(organizationId: string): Promise<TransicaoRow[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_funnel_transitions")
    .select("id, from_stage, to_stage, created_at, reason, changed_by, contacts(name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as unknown as TransicaoRow[]) ?? [];
}

/** Média de dias entre transições consecutivas do mesmo contato. */
async function buscarVelocidadeDias(organizationId: string): Promise<number> {
  const db = await createClient();
  const { data } = await db
    .from("pol_funnel_transitions")
    .select("contact_id, created_at")
    .eq("organization_id", organizationId)
    .order("contact_id", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(2000);

  let somaDias = 0;
  let n = 0;
  let contatoAnterior: string | null = null;
  let tempoAnterior = 0;
  for (const r of (data ?? []) as { contact_id: string; created_at: string }[]) {
    const t = new Date(r.created_at).getTime();
    if (r.contact_id === contatoAnterior) {
      somaDias += (t - tempoAnterior) / 86_400_000;
      n += 1;
    }
    contatoAnterior = r.contact_id;
    tempoAnterior = t;
  }
  return n > 0 ? Math.round((somaDias / n) * 10) / 10 : 0;
}

export default async function FunilPoliticoPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const [contagem, transicoes, velocidadeDias] = await Promise.all([
    buscarContagemPorEstagio(org.orgId),
    buscarTransicoesRecentes(org.orgId),
    buscarVelocidadeDias(org.orgId),
  ]);

  const total = ESTAGIOS.reduce((s, e) => s + (contagem[e] ?? 0), 0);
  const engajados =
    (contagem.simpatizante ?? 0) +
    (contagem.apoiador ?? 0) +
    (contagem.militante ?? 0) +
    (contagem.voto_certo ?? 0);
  const taxaAtivacao = total > 0 ? Math.round((engajados / total) * 100) : 0;
  const taxaConversao = total > 0 ? Math.round(((contagem.voto_certo ?? 0) / total) * 1000) / 10 : 0;

  return (
    <FunilClient
      contagem={contagem}
      transicoes={transicoes}
      total={total}
      taxaAtivacao={taxaAtivacao}
      taxaConversao={taxaConversao}
      velocidadeDias={velocidadeDias}
    />
  );
}

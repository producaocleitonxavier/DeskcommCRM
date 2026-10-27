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
  const contagem: Record<string, number> = {};
  for (const e of ESTAGIOS) contagem[e] = 0;

  // Uma contagem exata (head) por estágio — evita o cap de 1000 linhas do
  // PostgREST que acontecia ao buscar as linhas e contar no cliente.
  await Promise.all(
    ESTAGIOS.map(async (e) => {
      const { count } = await db
        .from("pol_leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("support_level", e);
      contagem[e] = count ?? 0;
    }),
  );
  return contagem;
}

const TEMPERATURAS = ["frio", "morno", "quente"] as const;

async function buscarContagemPorTemperatura(organizationId: string): Promise<Record<string, number>> {
  const db = await createClient();
  const contagem: Record<string, number> = {};
  for (const t of TEMPERATURAS) contagem[t] = 0;
  await Promise.all(
    TEMPERATURAS.map(async (t) => {
      const { count } = await db
        .from("pol_leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("temperature", t);
      contagem[t] = count ?? 0;
    }),
  );
  return contagem;
}

export interface MultiplicadorRow {
  contact_id: string;
  nome: string;
  /** Quantas pessoas trouxe (indicação creditada) — o ouro. */
  trouxe: number;
  /** Alcance estimado dos vídeos que compartilhou (cliques distintos). */
  alcancou: number;
}

/**
 * Os MULTIPLICADORES — quem TROUXE gente (indicação, o ouro) e/ou ALCANÇOU gente
 * (cliques nos vídeos que compartilhou). Top 10, ordenado por trouxe e depois por
 * alcance. União: quem só alcançou (sem indicar ainda) também é multiplicador.
 */
async function buscarMultiplicadores(organizationId: string): Promise<MultiplicadorRow[]> {
  const db = await createClient();
  const [{ data: inds }, { data: alc }] = await Promise.all([
    db.from("pol_indicacoes").select("indicador_contact_id").eq("organization_id", organizationId).limit(5000),
    db.rpc("fn_alcance_por_contato", { p_org: organizationId }),
  ]);
  const trouxeDe = new Map<string, number>();
  for (const r of (inds ?? []) as { indicador_contact_id: string }[]) {
    trouxeDe.set(r.indicador_contact_id, (trouxeDe.get(r.indicador_contact_id) ?? 0) + 1);
  }
  const alcancouDe = new Map<string, number>();
  for (const r of (alc ?? []) as { contact_id: string; alcancou: number | string }[]) {
    alcancouDe.set(r.contact_id, Number(r.alcancou) || 0);
  }
  const ids = new Set<string>([...trouxeDe.keys(), ...alcancouDe.keys()]);
  if (ids.size === 0) return [];
  const ranked = [...ids]
    .map((id) => ({ id, trouxe: trouxeDe.get(id) ?? 0, alcancou: alcancouDe.get(id) ?? 0 }))
    .sort((a, b) => b.trouxe - a.trouxe || b.alcancou - a.alcancou)
    .slice(0, 10);
  const { data: cts } = await db
    .from("contacts")
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("id", ranked.map((r) => r.id));
  const nomeDe = new Map(((cts ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name]));
  return ranked.map((r) => ({ contact_id: r.id, nome: nomeDe.get(r.id) ?? "Sem nome", trouxe: r.trouxe, alcancou: r.alcancou }));
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

  const [contagem, temperaturas, multiplicadores, transicoes, velocidadeDias] = await Promise.all([
    buscarContagemPorEstagio(org.orgId),
    buscarContagemPorTemperatura(org.orgId),
    buscarMultiplicadores(org.orgId),
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
      temperaturas={temperaturas}
      multiplicadores={multiplicadores}
      transicoes={transicoes}
      total={total}
      taxaAtivacao={taxaAtivacao}
      taxaConversao={taxaConversao}
      velocidadeDias={velocidadeDias}
    />
  );
}

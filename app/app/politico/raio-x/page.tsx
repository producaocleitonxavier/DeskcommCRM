/**
 * /app/politico/raio-x — Raio-X de Votos (War Room 2.0)
 *
 * Server: auth + fetch (pol_tse_data). Visual em ./_raiox-client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import RaioxClient from "./_raiox-client";

export const dynamic = "force-dynamic";

interface DadoTSE {
  id: string;
  election_year: number;
  state: string;
  city: string;
  zone: string | null;
  section: string | null;
  votes: number;
  turnout: number | null;
}

async function buscarDadosTSE(organizationId: string): Promise<DadoTSE[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_tse_data")
    .select("id, election_year, state, city, zone, section, votes, turnout")
    .eq("organization_id", organizationId)
    .order("election_year", { ascending: false })
    .order("votes", { ascending: false })
    .limit(500);
  return (data ?? []) as DadoTSE[];
}

export default async function RaioXPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const dados = await buscarDadosTSE(org.orgId);

  const secoes = new Set(dados.map((d) => `${d.zone}-${d.section}`).filter((s) => s !== "null-null"));
  const cidades = new Set(dados.map((d) => d.city));
  const totalVotos = dados.reduce((s, d) => s + d.votes, 0);
  const comp = dados.filter((d) => d.turnout != null).map((d) => d.turnout!);
  const mediaComparecimento = comp.length > 0 ? Math.round((comp.reduce((s, v) => s + v, 0) / comp.length) * 100) / 100 : 0;

  // Top cidades por votos (comparativo).
  const votosPorCidade = new Map<string, number>();
  for (const d of dados) votosPorCidade.set(d.city, (votosPorCidade.get(d.city) ?? 0) + d.votes);
  const topCidades = [...votosPorCidade.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  // Evolução por ano.
  const porAno = new Map<number, DadoTSE[]>();
  for (const d of dados) {
    const arr = porAno.get(d.election_year) ?? [];
    arr.push(d);
    porAno.set(d.election_year, arr);
  }
  const evolucao = [...porAno.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ano, linhas]) => ({
      ano,
      votos: linhas.reduce((s, d) => s + d.votes, 0),
      secoes: new Set(linhas.map((d) => `${d.zone}-${d.section}`)).size,
      registros: linhas.length,
    }));

  return (
    <RaioxClient
      resumo={{
        totalSecoes: secoes.size,
        totalVotos,
        mediaComparecimento,
        cidadesCobertas: cidades.size,
      }}
      topCidades={topCidades}
      evolucao={evolucao}
      temDados={dados.length > 0}
    />
  );
}

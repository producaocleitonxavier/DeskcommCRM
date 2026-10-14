/**
 * /app/politico/raio-x — Raio-X de Votos
 *
 * Análise por seção eleitoral com dados TSE — 4 visões:
 * Consulta, Território, Evolução, Ação.
 * Tabelas: pol_tse_data, pol_territories, pol_territory_metrics.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

interface DadoTSE {
  id: string;
  election_year: number;
  state: string;
  city: string;
  zone: string | null;
  section: string | null;
  candidate_name: string | null;
  party: string | null;
  votes: number;
  valid_votes: number | null;
  turnout: number | null;
}

interface ResumoTerritorial {
  totalSecoes: number;
  totalVotos: number;
  mediaComparecimento: number;
  cidadesCobertas: number;
}

// -- Data fetching -----------------------------------------------------------

async function buscarDadosTSE(organizationId: string): Promise<DadoTSE[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_tse_data")
    .select("id, election_year, state, city, zone, section, candidate_name, party, votes, valid_votes, turnout")
    .eq("organization_id", organizationId)
    .order("election_year", { ascending: false })
    .order("votes", { ascending: false })
    .limit(200);

  return (data ?? []) as DadoTSE[];
}

function calcularResumo(dados: DadoTSE[]): ResumoTerritorial {
  const secoes = new Set(dados.map((d) => `${d.zone}-${d.section}`).filter((s) => s !== "null-null"));
  const cidades = new Set(dados.map((d) => d.city));
  const totalVotos = dados.reduce((s, d) => s + d.votes, 0);
  const comparecimentos = dados.filter((d) => d.turnout != null).map((d) => d.turnout!);
  const mediaComp = comparecimentos.length > 0
    ? comparecimentos.reduce((s, v) => s + v, 0) / comparecimentos.length
    : 0;

  return {
    totalSecoes: secoes.size,
    totalVotos: totalVotos,
    mediaComparecimento: Math.round(mediaComp * 100) / 100,
    cidadesCobertas: cidades.size,
  };
}

// -- Componente --------------------------------------------------------------

export default async function RaioXPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const dados = await buscarDadosTSE(org.orgId);
  const resumo = calcularResumo(dados);

  // Agrupar por ano para a visão de evolução
  const porAno = dados.reduce<Record<number, DadoTSE[]>>((acc, d) => {
    (acc[d.election_year] ??= []).push(d);
    return acc;
  }, {});
  const anos = Object.keys(porAno).map(Number).sort((a, b) => b - a);

  // Top cidades por votos
  const votosPorCidade = dados.reduce<Record<string, number>>((acc, d) => {
    acc[d.city] = (acc[d.city] ?? 0) + d.votes;
    return acc;
  }, {});
  const topCidades = Object.entries(votosPorCidade)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Raio-X de Votos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Análise por seção eleitoral — dados TSE, evolução e ações territoriais.
          </p>
        </div>
        <Link
          href="/app/politico"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← War Room
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Seções mapeadas" valor={resumo.totalSecoes.toLocaleString("pt-BR")} cor="text-blue-500" />
        <KpiCard label="Votos registrados" valor={resumo.totalVotos.toLocaleString("pt-BR")} cor="text-emerald-500" />
        <KpiCard label="Comparecimento médio" valor={`${resumo.mediaComparecimento}%`} cor="text-violet-500" />
        <KpiCard label="Cidades" valor={String(resumo.cidadesCobertas)} cor="text-orange-500" />
      </div>

      {dados.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Raio-X de Votos:</strong> importe dados do TSE (resultados por seção eleitoral)
          para visualizar a análise territorial, evolução entre eleições e oportunidades de ação.
        </div>
      ) : (
        <>
          {/* Top cidades */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              📍 Top cidades por votos
            </h2>
            <div className="space-y-1">
              {topCidades.map(([cidade, votos], i) => {
                const maxVotos = topCidades[0]?.[1] ?? 0;
                const pct = maxVotos > 0 ? (votos / maxVotos) * 100 : 0;
                return (
                  <div key={cidade} className="flex items-center gap-3">
                    <span className="w-6 text-right text-xs font-mono text-muted-foreground">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium truncate">{cidade}</span>
                        <span className="text-xs tabular-nums text-muted-foreground ml-2">
                          {votos.toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Evolução por ano */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              📊 Evolução por eleição
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {anos.map((ano) => {
                const dadosAno = porAno[ano] ?? [];
                const totalAno = dadosAno.reduce((s, d) => s + d.votes, 0);
                const secoesAno = new Set(dadosAno.map((d) => `${d.zone}-${d.section}`)).size;
                return (
                  <div key={ano} className="rounded-lg border bg-card p-4">
                    <h3 className="text-lg font-bold tabular-nums">{ano}</h3>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>{totalAno.toLocaleString("pt-BR")} votos</p>
                      <p>{secoesAno} seções</p>
                      <p>{dadosAno.length} registros</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function KpiCard({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

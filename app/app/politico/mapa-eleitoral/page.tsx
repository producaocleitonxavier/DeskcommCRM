/**
 * /app/politico/mapa-eleitoral — Território (War Room 2.0)
 *
 * Camada "Zonas": mapa de calor de cidades (força × alcance) + ranking + tabela
 * (./_territorio-client). Camada "Prioridade": territórios por status estratégico.
 * Views: pol_vw_mapa_oportunidades + pol_vw_mapa_prioridade.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import TerritorioClient, { type CidadeRow } from "./_territorio-client";
import EleicoesClient from "./_eleicoes-client";
import ProjecaoClient from "./_projecao-client";
import { listarEleicoes, candidatosDaEleicao, mapaMunicipio, listarMunicipios } from "@/app/actions/politico/intelEleitoral";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

interface OportunidadeRow {
  territory_id: string;
  name: string;
  type: string;
  state_code: string | null;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  electorate: number | null;
  total_leads: number;
  novos_cadastros: number;
  simpatizantes: number;
  apoiadores: number;
  potencial_conversao: number;
  penetracao_pct: number;
  classificacao: string;
}

interface PrioridadeRow {
  territory_id: string;
  name: string;
  type: string;
  state_code: string | null;
  latitude: number | null;
  longitude: number | null;
  electorate: number | null;
  strategic_status: string;
  influence_score: number;
  flags_ativas: number;
  flags_criticas: number;
  priority_score: number;
}

// -- Helpers (camada prioridade) ---------------------------------------------

function statusLabel(status: string): string {
  const mapa: Record<string, string> = {
    critico: "Crítico",
    prioritario: "Prioritário",
    oportunidade: "Oportunidade",
    normal: "Normal",
  };
  return mapa[status] ?? status;
}

function statusEstilo(status: string): { bg: string; color: string } {
  const mapa: Record<string, { bg: string; color: string }> = {
    critico: { bg: "#FBE4E2", color: "#A3302A" },
    prioritario: { bg: "#FCF1DC", color: "#8A5A10" },
    oportunidade: { bg: "#E4E7F8", color: "#2F3DA8" },
    normal: { bg: "#F0F0EB", color: "var(--color-text-muted)" },
  };
  return mapa[status] ?? { bg: "#F0F0EB", color: "var(--color-text-muted)" };
}

function StatusPill({ status }: { status: string }) {
  const s = statusEstilo(status);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {statusLabel(status)}
    </span>
  );
}

function KpiCardSimples({
  label,
  value,
  sub,
  bg,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  bg?: string;
  accent?: string;
}) {
  return (
    <div
      className="flex-1 min-w-[140px] rounded-[20px] p-4"
      style={{ background: bg ?? "var(--color-surface)", boxShadow: "var(--wr-card-shadow)" }}
    >
      <div className="text-[13px] font-medium" style={{ color: accent ?? "var(--color-text-muted)" }}>
        {label}
      </div>
      <div className="font-heading text-[28px] font-bold mt-0.5 tabular-nums" style={{ color: accent ?? "var(--color-text)" }}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      {sub && (
        <div className="text-[12px] mt-0.5" style={{ color: accent ?? "var(--color-text-subtle)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// -- Data fetching -----------------------------------------------------------

async function buscarOportunidades(organizationId: string): Promise<OportunidadeRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("pol_vw_mapa_oportunidades")
    .select("*")
    .eq("organization_id", organizationId)
    .order("total_leads", { ascending: false })
    .limit(600);

  if (error) {
    console.error("Erro ao buscar oportunidades:", error.message);
    return [];
  }
  return (data ?? []) as unknown as OportunidadeRow[];
}

async function buscarPrioridades(organizationId: string): Promise<PrioridadeRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("pol_vw_mapa_prioridade")
    .select("*")
    .eq("organization_id", organizationId)
    .order("priority_score", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Erro ao buscar prioridades:", error.message);
    return [];
  }
  return (data ?? []) as unknown as PrioridadeRow[];
}

// -- Camada Eleições (Inteligência/TSE) --------------------------------------

// Prioridade de cargo no seletor: Governador, Prefeito, Dep. Federal, Estadual, Vereador.
const CARGO_PRIO: Record<number, number> = { 3: 0, 11: 1, 6: 2, 7: 3, 13: 4 };

async function montarEleicoes(eleicaoParam?: string, candParam?: string) {
  const eleicoes = await listarEleicoes();
  if (eleicoes.length === 0) {
    return { eleicoes: [], eleicaoInicial: 0, candidatos: [], candidatoInicial: "", pontos: [], nomes: {} as Record<string, string> };
  }
  eleicoes.sort(
    (a, b) => b.ano - a.ano || (CARGO_PRIO[a.cargo_cod] ?? 9) - (CARGO_PRIO[b.cargo_cod] ?? 9) || b.turno - a.turno,
  );
  const sel = eleicoes.find((e) => String(e.id) === eleicaoParam) ?? eleicoes[0]!;
  const [candidatos, nomes] = await Promise.all([candidatosDaEleicao(sel.id), listarMunicipios()]);
  const candidatoInicial = candidatos.find((c) => c.nr === candParam)?.nr ?? candidatos[0]?.nr ?? "";
  const pontos = candidatoInicial ? await mapaMunicipio(sel.id, candidatoInicial) : [];
  return { eleicoes, eleicaoInicial: sel.id, candidatos, candidatoInicial, pontos, nomes };
}

// -- Componente principal ----------------------------------------------------

export default async function TerritorioPage({
  searchParams,
}: {
  searchParams: Promise<{ camada?: string; eleicao?: string; cand?: string }>;
}) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  // Entrada didática: o mapa de votos (TSE) é a primeira leitura; CRM e projeção na sequência.
  const camada = params.camada ?? "eleicoes";

  const [oportunidades, prioridades] = await Promise.all([
    camada === "oportunidades" ? buscarOportunidades(org.orgId) : Promise.resolve([]),
    camada === "prioridade" ? buscarPrioridades(org.orgId) : Promise.resolve([]),
  ]);

  // Camada "Eleições" (Inteligência/TSE): choropleth por município.
  const eleicoesData = camada === "eleicoes" ? await montarEleicoes(params.eleicao, params.cand) : null;

  // Camada "Projeção" (dado vivo): universo de votos × base do CRM por zona.
  const projecaoData = camada === "projecao"
    ? await Promise.all([listarEleicoes(), listarMunicipiosRaioX()])
    : null;

  // -- Camada oportunidades: cidades geolocalizadas + força --
  const cidades: CidadeRow[] = oportunidades
    .filter((o) => o.latitude != null && o.longitude != null)
    .map((o) => ({
      id: o.territory_id,
      name: o.name,
      uf: o.state_code,
      lat: Number(o.latitude),
      lng: Number(o.longitude),
      total: o.total_leads,
      novos: o.novos_cadastros,
      simpatizantes: o.simpatizantes,
      apoiadores: o.apoiadores,
      // Força = engajamento ponderado por nível de apoio (reflete "força real").
      forca: o.novos_cadastros * 1 + o.simpatizantes * 3 + o.apoiadores * 6,
    }))
    .sort((a, b) => b.total - a.total);

  const totalContatos = cidades.reduce((s, c) => s + c.total, 0);
  const cidadeTop = cidades[0]?.name ?? "—";
  const concentracaoTopPct =
    totalContatos > 0 && cidades[0] ? Math.round((cidades[0].total / totalContatos) * 100) : 0;

  // -- Stats para a camada prioridade --
  const zonasCriticas = prioridades.filter((p) => p.strategic_status === "critico").length;
  const zonasPrioritarias = prioridades.filter((p) => p.strategic_status === "prioritario").length;
  const zonasOportunidade = prioridades.filter((p) => p.strategic_status === "oportunidade").length;
  const zonasNormais = prioridades.filter((p) => p.strategic_status === "normal").length;

  const tabs = [
    { value: "eleicoes", label: "Mapa de Votos", href: "/app/politico/mapa-eleitoral" },
    { value: "oportunidades", label: "Minha Força", href: "/app/politico/mapa-eleitoral?camada=oportunidades" },
    { value: "projecao", label: "Projeção", href: "/app/politico/mapa-eleitoral?camada=projecao" },
    { value: "prioridade", label: "Prioridade", href: "/app/politico/mapa-eleitoral?camada=prioridade" },
  ];

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header (Centro de Comando) ──────────────────────────── */}
      <CommandHero
        eyebrow="War Room · Território"
        titulo="Território"
        subtitulo="Onde estão os votos e onde falta gente cadastrada."
        extra={
          <div role="tablist" aria-label="Camadas do território" className="flex gap-1.5">
            {tabs.map((tab) => {
              const active = camada === tab.value;
              return (
                <Link
                  key={tab.value}
                  href={tab.href}
                  role="tab"
                  aria-selected={active}
                  className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-semibold transition-colors"
                  style={
                    active
                      ? { background: "#D7F36A", color: "#14181F" }
                      : { border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)" }
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        }
      />

      {/* ── Camada: Oportunidades (Zonas) ───────────────────────── */}
      {camada === "oportunidades" &&
        (cidades.length === 0 ? (
          <div className="wr-card p-12 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Nenhuma cidade localizada ainda. Vincule os contatos a municípios com latitude e longitude.
            </p>
          </div>
        ) : (
          <TerritorioClient
            cidades={cidades}
            totalContatos={totalContatos}
            cidadeTop={cidadeTop}
            concentracaoTopPct={concentracaoTopPct}
          />
        ))}

      {/* ── Camada: Prioridade ──────────────────────────────────── */}
      {camada === "prioridade" &&
        (prioridades.length === 0 ? (
          <div className="wr-card p-12 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Nenhum território cadastrado. Cadastre territórios com latitude e longitude.
            </p>
          </div>
        ) : (
          <>
            <section aria-label="Resumo de prioridade" className="flex flex-wrap gap-3">
              <KpiCardSimples label="Crítico" value={zonasCriticas} sub="Ação imediata" bg="#FBE4E2" accent="#A3302A" />
              <KpiCardSimples label="Prioritário" value={zonasPrioritarias} sub="Ação planejada" bg="#FCF1DC" accent="#8A5A10" />
              <KpiCardSimples label="Oportunidade" value={zonasOportunidade} sub="Potencial" />
              <KpiCardSimples label="Normal" value={zonasNormais} sub="Operação regular" />
            </section>

            <section aria-label="Territórios por prioridade" className="wr-card pt-2 pb-0 px-0">
              <div className="px-5 pt-3 pb-2">
                <h2 className="font-heading text-base font-semibold" style={{ color: "var(--color-text)" }}>
                  Territórios por prioridade estratégica
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      {["Território", "UF", "Status", "Score", "Influência", "Flags", "Flags críticas"].map((col) => (
                        <th
                          key={col}
                          className={`font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b ${
                            ["Score", "Influência", "Flags", "Flags críticas"].includes(col) ? "text-right" : "text-left"
                          }`}
                          style={{ color: "var(--color-text-subtle)", borderColor: "var(--color-border)" }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prioridades.map((p) => (
                      <tr key={p.territory_id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td className="px-4 py-3.5 whitespace-nowrap font-semibold" style={{ color: "var(--color-text)" }}>
                          {p.name}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                          {p.state_code ?? "—"}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <StatusPill status={p.strategic_status} />
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-bold font-heading">
                          {p.priority_score}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                          {p.influence_score}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums">
                          {p.flags_ativas > 0 ? (
                            <span className="font-medium" style={{ color: "#8A5A10" }}>{p.flags_ativas}</span>
                          ) : (
                            <span style={{ color: "var(--color-text-subtle)" }}>0</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums">
                          {p.flags_criticas > 0 ? (
                            <span className="font-medium" style={{ color: "#A3302A" }}>{p.flags_criticas}</span>
                          ) : (
                            <span style={{ color: "var(--color-text-subtle)" }}>0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="flex justify-between items-center px-4 py-3 text-[13px]"
                style={{ color: "var(--color-text-subtle)", borderTop: "1px solid var(--color-border)" }}
              >
                <span>{prioridades.length} territórios</span>
              </div>
            </section>
          </>
        ))}

      {/* ── Camada: Eleições (Inteligência/TSE) ──────────────────── */}
      {camada === "eleicoes" &&
        (eleicoesData && eleicoesData.eleicoes.length > 0 ? (
          <EleicoesClient
            eleicoes={eleicoesData.eleicoes}
            eleicaoInicial={eleicoesData.eleicaoInicial}
            candidatosIniciais={eleicoesData.candidatos}
            candidatoInicial={eleicoesData.candidatoInicial}
            pontosIniciais={eleicoesData.pontos}
            nomes={eleicoesData.nomes}
          />
        ) : (
          <div className="wr-card p-12 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Dados eleitorais ainda não carregados nesta instalação.
            </p>
          </div>
        ))}

      {/* ── Camada: Projeção (dado vivo — universo × base por zona) ── */}
      {camada === "projecao" &&
        (projecaoData && projecaoData[0].length > 0 ? (
          <ProjecaoClient eleicoes={projecaoData[0]} municipios={projecaoData[1]} />
        ) : (
          <div className="wr-card p-12 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Dados eleitorais ainda não carregados nesta instalação.
            </p>
          </div>
        ))}
    </div>
  );
}

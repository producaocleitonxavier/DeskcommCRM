/**
 * /app/politico/mapa-eleitoral — Território (War Room 2.0)
 *
 * Mapa territorial com zonas, votos, contatos e cobertura.
 * Views: pol_vw_mapa_oportunidades + pol_vw_mapa_prioridade.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

// -- Tipos -------------------------------------------------------------------

interface OportunidadeRow {
  territory_id: string;
  name: string;
  type: string;
  state_code: string | null;
  latitude: number;
  longitude: number;
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
  latitude: number;
  longitude: number;
  electorate: number | null;
  strategic_status: string;
  influence_score: number;
  flags_ativas: number;
  flags_criticas: number;
  priority_score: number;
}

// -- Helpers -----------------------------------------------------------------

/** Classificação → label de situação no design WR2 */
function situacaoLabel(classificacao: string): string {
  const mapa: Record<string, string> = {
    consolidado: "Defender",
    oportunidade: "Expandir",
    alta_oportunidade: "Recuperar",
  };
  return mapa[classificacao] ?? classificacao;
}

/** Classificação → estilo de pill semáforo WR2 */
function situacaoEstilo(classificacao: string): { bg: string; color: string } {
  const mapa: Record<string, { bg: string; color: string }> = {
    consolidado: { bg: "#E2F5EC", color: "#17784F" },
    oportunidade: { bg: "#FCF1DC", color: "#8A5A10" },
    alta_oportunidade: { bg: "#FBE4E2", color: "#A3302A" },
  };
  return mapa[classificacao] ?? { bg: "#F0F0EB", color: "#4A4F59" };
}

/** Status estratégico → label + estilo */
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
    normal: { bg: "#F0F0EB", color: "#4A4F59" },
  };
  return mapa[status] ?? { bg: "#F0F0EB", color: "#4A4F59" };
}

// -- Data fetching -----------------------------------------------------------

async function buscarOportunidades(organizationId: string): Promise<OportunidadeRow[]> {
  const db = await createClient();

  const { data, error } = await db
    .from("pol_vw_mapa_oportunidades")
    .select("*")
    .eq("organization_id", organizationId)
    .order("potencial_conversao", { ascending: false })
    .limit(200);

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

// -- Sub-componentes ---------------------------------------------------------

function SituacaoPill({ classificacao }: { classificacao: string }) {
  const s = situacaoEstilo(classificacao);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {situacaoLabel(classificacao)}
    </span>
  );
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

function CoberturaBar({ pct }: { pct: number }) {
  const clampedPct = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-[96px] h-2 rounded"
        style={{ background: "#F0F0EB" }}
      >
        <div
          className="h-2 rounded"
          style={{
            background: "#16181D",
            width: `${clampedPct}%`,
          }}
        />
      </div>
      <span className="text-xs tabular-nums font-medium" style={{ color: "#4A4F59" }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

function KpiCard({
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
      style={{
        background: bg ?? "#FFFFFF",
        boxShadow: "var(--wr-card-shadow)",
      }}
    >
      <div className="text-[13px] font-medium" style={{ color: accent ?? "#4A4F59" }}>
        {label}
      </div>
      <div
        className="font-heading text-[28px] font-bold mt-0.5 tabular-nums"
        style={{ color: accent ?? "var(--color-text)" }}
      >
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      {sub && (
        <div className="text-[12px] mt-0.5" style={{ color: accent ?? "#5B606B" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// -- Componente principal ----------------------------------------------------

export default async function TerritorioPage({
  searchParams,
}: {
  searchParams: Promise<{ camada?: string }>;
}) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const camada = params.camada ?? "oportunidades";

  const [oportunidades, prioridades] = await Promise.all([
    camada === "oportunidades" ? buscarOportunidades(org.orgId) : Promise.resolve([]),
    camada === "prioridade" ? buscarPrioridades(org.orgId) : Promise.resolve([]),
  ]);

  // -- Stats para a camada oportunidades --
  const totalVotos = oportunidades.reduce((acc, o) => acc + (o.electorate ?? 0), 0);
  const totalContatos = oportunidades.reduce((acc, o) => acc + o.total_leads, 0);
  const zonasConsolidadas = oportunidades.filter((o) => o.classificacao === "consolidado").length;
  const zonasBaixaCobertura = oportunidades.filter((o) => o.penetracao_pct < 5).length;
  const totalZonas = oportunidades.length;

  // -- Stats para a camada prioridade --
  const zonasCriticas = prioridades.filter((p) => p.strategic_status === "critico").length;
  const zonasPrioritarias = prioridades.filter((p) => p.strategic_status === "prioritario").length;
  const zonasOportunidade = prioridades.filter((p) => p.strategic_status === "oportunidade").length;
  const zonasNormais = prioridades.filter((p) => p.strategic_status === "normal").length;

  const tabs = [
    { value: "oportunidades", label: "Zonas", href: "/app/politico/mapa-eleitoral" },
    { value: "prioridade", label: "Prioridade", href: "/app/politico/mapa-eleitoral?camada=prioridade" },
  ];

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header card ─────────────────────────────────────────── */}
      <header className="wr-card p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[36px] font-bold leading-tight">Território</h1>
          <p className="mt-1.5 text-base" style={{ color: "#4A4F59" }}>
            Onde estão os votos e onde falta gente cadastrada.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Tab bar */}
          <div role="tablist" aria-label="Camadas do território" className="flex gap-1">
            {tabs.map((tab) => {
              const active = camada === tab.value;
              return (
                <Link
                  key={tab.value}
                  href={tab.href}
                  role="tab"
                  aria-selected={active}
                  className="inline-flex items-center h-10 px-4 rounded-full font-semibold text-sm transition-colors"
                  style={
                    active
                      ? { background: "#16181D", color: "#FFFFFF" }
                      : { background: "#FFFFFF", color: "#4A4F59", border: "1px solid #DCDCD5" }
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Camada: Oportunidades ───────────────────────────────── */}
      {camada === "oportunidades" && (
        <>
          {oportunidades.length === 0 ? (
            <div className="wr-card p-12 text-center">
              <p className="text-sm" style={{ color: "#5B606B" }}>
                Nenhum território cadastrado. Cadastre territórios com latitude e longitude.
              </p>
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <section aria-label="Resumo territorial" className="flex flex-wrap gap-3">
                <KpiCard
                  label="Eleitores cadastrados"
                  value={totalVotos}
                  sub={`${totalZonas} zonas`}
                />
                <KpiCard
                  label="Contatos na base"
                  value={totalContatos}
                />
                <KpiCard
                  label="Zonas para defender"
                  value={zonasConsolidadas}
                />
                <KpiCard
                  label="Zonas com pouca gente"
                  value={zonasBaixaCobertura}
                  sub="cobertura abaixo de 5%"
                  bg="#D7F36A"
                  accent="#2E3410"
                />
              </section>

              {/* Table */}
              <section aria-label="Zonas por força eleitoral" className="wr-card pt-2 pb-0 px-0">
                <div className="px-5 pt-3 pb-2">
                  <h2 className="font-heading text-base font-semibold" style={{ color: "#16181D" }}>
                    Zonas por força eleitoral
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        {["Zona", "UF", "Leads", "Novos", "Pot. conversão", "Cobertura", "Situação"].map((col) => (
                          <th
                            key={col}
                            className={`font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b ${
                              ["Leads", "Novos", "Pot. conversão"].includes(col) ? "text-right" : "text-left"
                            }`}
                            style={{ color: "#5B606B", borderColor: "#ECECE7" }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {oportunidades.map((o) => {
                        const highlighted = o.classificacao === "consolidado" || o.penetracao_pct >= 15;
                        return (
                          <tr
                            key={o.territory_id}
                            className="group transition-colors hover:bg-[#F6F6F2]"
                            style={{
                              borderBottom: "1px solid #F0F0EB",
                              ...(highlighted ? { background: "#FAFDEB" } : {}),
                            }}
                          >
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="font-semibold" style={{ color: "#16181D" }}>
                                {o.name}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap" style={{ color: "#4A4F59" }}>
                              {o.state_code ?? "—"}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums" style={{ color: "#16181D" }}>
                              {o.total_leads.toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums" style={{ color: "#4A4F59" }}>
                              {o.novos_cadastros.toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-bold">
                              {o.potencial_conversao.toLocaleString("pt-BR")}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <CoberturaBar pct={o.penetracao_pct} />
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <SituacaoPill classificacao={o.classificacao} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div
                  className="px-4 py-3 text-[12px]"
                  style={{ color: "#9A9D8F", borderTop: "1px solid #F0F0EB" }}
                >
                  Cobertura = contatos ÷ eleitores cadastrados na zona
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* ── Camada: Prioridade ──────────────────────────────────── */}
      {camada === "prioridade" && (
        <>
          {prioridades.length === 0 ? (
            <div className="wr-card p-12 text-center">
              <p className="text-sm" style={{ color: "#5B606B" }}>
                Nenhum território cadastrado. Cadastre territórios com latitude e longitude.
              </p>
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <section aria-label="Resumo de prioridade" className="flex flex-wrap gap-3">
                <KpiCard
                  label="Crítico"
                  value={zonasCriticas}
                  sub="Ação imediata"
                  bg="#FBE4E2"
                  accent="#A3302A"
                />
                <KpiCard
                  label="Prioritário"
                  value={zonasPrioritarias}
                  sub="Ação planejada"
                  bg="#FCF1DC"
                  accent="#8A5A10"
                />
                <KpiCard
                  label="Oportunidade"
                  value={zonasOportunidade}
                  sub="Potencial"
                />
                <KpiCard
                  label="Normal"
                  value={zonasNormais}
                  sub="Operação regular"
                />
              </section>

              {/* Table */}
              <section aria-label="Territórios por prioridade" className="wr-card pt-2 pb-0 px-0">
                <div className="px-5 pt-3 pb-2">
                  <h2 className="font-heading text-base font-semibold" style={{ color: "#16181D" }}>
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
                            style={{ color: "#5B606B", borderColor: "#ECECE7" }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prioridades.map((p) => {
                        const isCritico = p.strategic_status === "critico";
                        return (
                          <tr
                            key={p.territory_id}
                            className="group transition-colors hover:bg-[#F6F6F2]"
                            style={{
                              borderBottom: "1px solid #F0F0EB",
                              ...(isCritico ? { background: "#FEF6F5" } : {}),
                            }}
                          >
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="font-semibold" style={{ color: "#16181D" }}>
                                {p.name}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap" style={{ color: "#4A4F59" }}>
                              {p.state_code ?? "—"}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <StatusPill status={p.strategic_status} />
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-bold font-heading">
                              {p.priority_score}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums" style={{ color: "#4A4F59" }}>
                              {p.influence_score}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums">
                              {p.flags_ativas > 0 ? (
                                <span className="font-medium" style={{ color: "#8A5A10" }}>
                                  {p.flags_ativas}
                                </span>
                              ) : (
                                <span style={{ color: "#9A9D8F" }}>0</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums">
                              {p.flags_criticas > 0 ? (
                                <span className="font-medium" style={{ color: "#A3302A" }}>
                                  {p.flags_criticas}
                                </span>
                              ) : (
                                <span style={{ color: "#9A9D8F" }}>0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div
                  className="flex justify-between items-center px-4 py-3 text-[13px]"
                  style={{ color: "#5B606B", borderTop: "1px solid #F0F0EB" }}
                >
                  <span>
                    {prioridades.length} territórios
                  </span>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

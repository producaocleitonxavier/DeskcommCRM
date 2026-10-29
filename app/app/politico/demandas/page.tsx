/**
 * /app/politico/demandas — Gabinete (War Room 2.0)
 *
 * Demandas, lideranças e projetos de lei do mandato.
 * Tabela: demandas (com extensões pol_*).
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { avisoDeResolucaoLigado } from "@/lib/politico/aviso-de-resolucao";
import DemandasCharts from "./_demandas-charts";
import AvisoAutoToggle from "./_aviso-auto-toggle";
import { RelatorioPdfButton } from "@/components/politico/relatorio-pdf-button";

export const dynamic = "force-dynamic";

const ESTADO_COR: Record<string, string> = {
  aberta: "#F59E0B",
  em_atendimento: "#3B82F6",
  encaminhada: "#A855F7",
  aguardando_cliente: "#FCD34D",
  resolvida: "#22C55E",
  encerrada: "#9CA3AF",
};

// -- Tipos -------------------------------------------------------------------

interface Demanda {
  id: string;
  assunto: string | null;
  estado: string;
  origem: string | null;
  pol_tipo: string | null;
  pol_prioridade: string | null;
  pol_orgao_destino: string | null;
  pol_encaminhamento_ia: string | null;
  dono_kind: string | null;
  aberta_em: string;
  prazo_em: string | null;
  desfecho: string | null;
  pol_autoatendimento?: boolean | null;
}

// -- Helpers -----------------------------------------------------------------

const POR_PAGINA = 25;

function estadoLabel(estado: string): string {
  const mapa: Record<string, string> = {
    aberta: "Nova",
    em_atendimento: "Em atendimento",
    encaminhada: "Encaminhada",
    aguardando_cliente: "Aguardando",
    resolvida: "Atendida",
    encerrada: "Encerrada",
  };
  return mapa[estado] ?? estado;
}

function estadoEstilo(estado: string): { bg: string; color: string } {
  const mapa: Record<string, { bg: string; color: string }> = {
    aberta: { bg: "#F0F0EB", color: "var(--color-text-muted)" },
    em_atendimento: { bg: "#E4E7F8", color: "#2F3DA8" },
    encaminhada: { bg: "#F0E7FB", color: "#7C3AED" },
    aguardando_cliente: { bg: "#FCF1DC", color: "#8A5A10" },
    resolvida: { bg: "#E2F5EC", color: "#17784F" },
    encerrada: { bg: "#F0F0EB", color: "var(--color-text-subtle)" },
  };
  return mapa[estado] ?? { bg: "#F0F0EB", color: "var(--color-text-muted)" };
}

function prioridadeLabel(prioridade: string | null): string | null {
  if (!prioridade || prioridade === "normal") return null;
  const mapa: Record<string, string> = {
    baixa: "Baixa",
    alta: "Alta",
    urgente: "Urgente",
  };
  return mapa[prioridade] ?? prioridade;
}

function prioridadeEstilo(prioridade: string | null): { bg: string; color: string } | null {
  if (!prioridade || prioridade === "normal" || prioridade === "baixa") return null;
  const mapa: Record<string, { bg: string; color: string }> = {
    alta: { bg: "#FCF1DC", color: "#8A5A10" },
    urgente: { bg: "#FBE4E2", color: "#A3302A" },
  };
  return mapa[prioridade] ?? null;
}

function diasParaPrazo(prazo: string | null): number | null {
  if (!prazo) return null;
  const agora = new Date();
  const prazoDt = new Date(prazo);
  return Math.ceil((prazoDt.getTime() - agora.getTime()) / 86400000);
}

function formatarData(data: string): string {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// -- Data fetching -----------------------------------------------------------

/**
 * A coluna `pol_autoatendimento` (migration 9072) existe nesta instalação? Se
 * ainda não, a tela se comporta exatamente como antes — sem a camada "A IA
 * orientou" e sem quebrar nenhuma consulta. Detecção barata (1 linha).
 */
async function colunaAutoExiste(organizationId: string): Promise<boolean> {
  const db = await createClient();
  const { error } = await db
    .from("demandas")
    .select("pol_autoatendimento")
    .eq("organization_id", organizationId)
    .limit(1);
  return !error;
}

async function buscarDemandas(
  organizationId: string,
  pagina: number,
  filtroEstado: string | undefined,
  opts: { temAuto: boolean; verAuto: boolean },
) {
  const db = await createClient();
  const offset = (pagina - 1) * POR_PAGINA;

  const colunas =
    "id, assunto, estado, origem, pol_tipo, pol_prioridade, pol_orgao_destino, pol_encaminhamento_ia, dono_kind, aberta_em, prazo_em, desfecho" +
    (opts.temAuto ? ", pol_autoatendimento" : "");

  let query = db
    .from("demandas")
    .select(colunas, { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("pol_gabinete", true)
    .order("aberta_em", { ascending: false })
    .range(offset, offset + POR_PAGINA - 1);

  // A fila de trabalho mostra só o que exige a mão do gabinete; a aba "A IA
  // orientou" mostra só os registros de autoatendimento (inteligência territorial).
  if (opts.temAuto) {
    query = query.eq("pol_autoatendimento", opts.verAuto);
  }

  if (filtroEstado) {
    query = query.eq("estado", filtroEstado);
  }

  const { data, count } = await query;

  return {
    // `select` com colunas dinâmicas (string concatenada) faz o postgrest-js
    // perder a inferência e tipar como GenericStringError[]; o cast via unknown
    // é o padrão nesses casos (mesmo motivo do `as unknown as` em obras-actions).
    demandas: (data ?? []) as unknown as Demanda[],
    total: count ?? 0,
  };
}

async function contarEstados(organizationId: string, temAuto: boolean) {
  const db = await createClient();
  const counts: Record<string, number> = {};

  // Quando a camada de autoatendimento existe, os KPIs são do TRABALHO do
  // gabinete — os registros de autoatendimento têm o próprio contador (_auto).
  let qTotal = db
    .from("demandas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("pol_gabinete", true);
  if (temAuto) qTotal = qTotal.eq("pol_autoatendimento", false);
  const { count: totalCount } = await qTotal;
  counts._total = totalCount ?? 0;

  // Abertas (não resolvida/encerrada)
  let qAbertas = db
    .from("demandas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("pol_gabinete", true)
    .not("estado", "in", "(resolvida,encerrada)");
  if (temAuto) qAbertas = qAbertas.eq("pol_autoatendimento", false);
  const { count: abertasCount } = await qAbertas;
  counts._abertas = abertasCount ?? 0;

  // Resolvidas este mês
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  let qResolv = db
    .from("demandas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("pol_gabinete", true)
    .eq("estado", "resolvida")
    .gte("aberta_em", inicioMes.toISOString());
  if (temAuto) qResolv = qResolv.eq("pol_autoatendimento", false);
  const { count: resolvidasMes } = await qResolv;
  counts._resolvidas_mes = resolvidasMes ?? 0;

  // Registros de autoatendimento (a IA orientou — camada de inteligência).
  if (temAuto) {
    const { count: autoCount } = await db
      .from("demandas")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("pol_gabinete", true)
      .eq("pol_autoatendimento", true);
    counts._auto = autoCount ?? 0;
  }

  return counts;
}

// -- Sub-componentes ---------------------------------------------------------

function StatusPill({ estado }: { estado: string }) {
  const s = estadoEstilo(estado);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {estadoLabel(estado)}
    </span>
  );
}

// -- Componente principal ----------------------------------------------------

export default async function GabinetePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  // Interruptor do ciclo da demanda — só o admin vê e decide (default LIGADO).
  const ehAdmin = ROLE_RANK[org.role] >= ROLE_RANK.admin;
  let avisoLigado = true;
  if (ehAdmin) {
    const dbOrg = await createClient();
    const { data: orgRow } = await dbOrg.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
    avisoLigado = avisoDeResolucaoLigado(orgRow?.settings);
  }

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const filtroEstado = typeof params.estado === "string" ? params.estado : undefined;

  // Camada "A IA orientou" (autoatendimento): existe só se a migration 9072 rodou.
  const temAuto = await colunaAutoExiste(org.orgId);
  const verAuto = temAuto && params.view === "autoatendimento";

  const [{ demandas, total }, contagens] = await Promise.all([
    buscarDemandas(org.orgId, pagina, filtroEstado, { temAuto, verAuto }),
    contarEstados(org.orgId, temAuto),
  ]);

  const totalPaginas = Math.ceil(total / POR_PAGINA);

  // Distribuição por status + tempo médio de resolução (para os gráficos).
  // Os gráficos refletem o TRABALHO do gabinete — excluem os de autoatendimento.
  const dbCharts = await createClient();
  const ESTADOS_PIE = ["aberta", "em_atendimento", "encaminhada", "resolvida", "encerrada"];
  const [distRes, resolvidasRes] = await Promise.all([
    Promise.all(
      ESTADOS_PIE.map((e) => {
        let q = dbCharts.from("demandas").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("pol_gabinete", true).eq("estado", e);
        if (temAuto) q = q.eq("pol_autoatendimento", false);
        return q;
      }),
    ),
    (() => {
      let q = dbCharts.from("demandas").select("aberta_em, fechada_em").eq("organization_id", org.orgId).eq("pol_gabinete", true).not("fechada_em", "is", null).limit(500);
      if (temAuto) q = q.eq("pol_autoatendimento", false);
      return q;
    })(),
  ]);
  const statusPie = ESTADOS_PIE.map((e, i) => ({
    name: estadoLabel(e),
    value: distRes[i]?.count ?? 0,
    fill: ESTADO_COR[e] ?? "#9CA3AF",
  })).filter((x) => x.value > 0);
  const fechadas = (resolvidasRes.data ?? []) as { aberta_em: string; fechada_em: string }[];
  const tempoMedioDias =
    fechadas.length > 0
      ? Math.round(
          (fechadas.reduce((s, d) => s + (new Date(d.fechada_em).getTime() - new Date(d.aberta_em).getTime()), 0) /
            fechadas.length /
            86_400_000) * 10,
        ) / 10
      : null;

  const viewAtual = verAuto ? "autoatendimento" : undefined;
  function montarQuery(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { estado: filtroEstado, view: viewAtual, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header card ─────────────────────────────────────────── */}
      <header className="wr-card p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[36px] font-bold leading-tight">Gabinete</h1>
          <p className="mt-1.5 text-base" style={{ color: "var(--color-text-muted)" }}>
            Demandas, lideranças e projetos de lei do mandato.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {ehAdmin && <AvisoAutoToggle ligadoInicial={avisoLigado} />}
          <RelatorioPdfButton filtroEstado={filtroEstado} />
          <Link
            href="/app/politico/demandas/nova"
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: "#D7F36A", color: "#16181D" }}
          >
            + Nova demanda
          </Link>
        </div>
      </header>

      {/* ── Demandas ────────────────────────────────────────────── */}
      <>
          {/* KPIs + distribuição por status */}
          <DemandasCharts
            kpis={{
              total: contagens._total ?? 0,
              abertas: contagens._abertas ?? 0,
              resolvidasMes: contagens._resolvidas_mes ?? 0,
              tempoMedioDias,
            }}
            statusPie={statusPie}
          />

          {/* Demandas table */}
          <section aria-label="Lista de demandas" className="wr-card pt-2 pb-0 px-0">
            {/* Alternador de visão: fila de trabalho vs. o que a IA orientou */}
            {temAuto && (
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
                <Link
                  href={`/app/politico/demandas${montarQuery({ view: undefined, estado: undefined, pagina: "1" })}`}
                  className="inline-flex items-center h-9 px-4 rounded-full text-sm font-semibold transition-colors"
                  style={
                    !verAuto
                      ? { background: "#16181D", color: "#FFFFFF" }
                      : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }
                  }
                >
                  Trabalho do gabinete
                </Link>
                <Link
                  href={`/app/politico/demandas${montarQuery({ view: "autoatendimento", estado: undefined, pagina: "1" })}`}
                  className="inline-flex items-center h-9 px-4 rounded-full text-sm font-semibold transition-colors"
                  style={
                    verAuto
                      ? { background: "#16181D", color: "#FFFFFF" }
                      : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }
                  }
                  title="Zeladoria que o cidadão resolve sozinho pelo link da Prefeitura. A IA registrou só para o gabinete acompanhar o bairro — não é trabalho a fazer."
                >
                  ✨ A IA orientou{typeof contagens._auto === "number" ? ` (${contagens._auto})` : ""}
                </Link>
              </div>
            )}

            {verAuto && (
              <p className="px-4 pt-3 text-[13px]" style={{ color: "var(--color-text-subtle)" }}>
                Estes registros são de inteligência territorial: o cidadão foi orientado a resolver pelo link da Prefeitura. Não exigem ação do gabinete.
              </p>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2.5 px-4 py-3.5">
              <Link
                href={`/app/politico/demandas${montarQuery({ estado: undefined, pagina: "1" })}`}
                className="inline-flex items-center h-9 px-3.5 rounded-full text-sm font-medium transition-colors"
                style={
                  !filtroEstado
                    ? { background: "#16181D", color: "#FFFFFF" }
                    : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }
                }
              >
                Todas
              </Link>
              {["aberta", "em_atendimento", "encaminhada", "resolvida"].map((est) => (
                <Link
                  key={est}
                  href={`/app/politico/demandas${montarQuery({ estado: est, pagina: "1" })}`}
                  className="inline-flex items-center h-9 px-3.5 rounded-full text-sm font-medium transition-colors"
                  style={
                    filtroEstado === est
                      ? { background: "#16181D", color: "#FFFFFF" }
                      : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }
                  }
                >
                  {estadoLabel(est)}
                </Link>
              ))}
            </div>

            {demandas.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
                  Nenhuma demanda encontrada. Cadastre a primeira demanda para iniciar o acompanhamento.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      {["Demanda", "Tipo", "Órgão destino", "Status", "Visita", "Prioridade"].map((col) => (
                        <th
                          key={col}
                          className="text-left font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b"
                          style={{ color: "var(--color-text-subtle)", borderColor: "var(--color-border)" }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {demandas.map((d) => {
                      const diasPrazo = diasParaPrazo(d.prazo_em);
                      const atrasada = diasPrazo !== null && diasPrazo < 0 && !["resolvida", "encerrada"].includes(d.estado);
                      const urgente = d.pol_prioridade === "urgente";
                      const pLabel = prioridadeLabel(d.pol_prioridade);
                      const pEstilo = prioridadeEstilo(d.pol_prioridade);
                      const temIA = !!d.pol_encaminhamento_ia;

                      return (
                        <tr
                          key={d.id}
                          className="group transition-colors hover:bg-[var(--color-surface-elevated)]"
                          style={{
                            borderBottom: "1px solid var(--color-border)",
                            ...((atrasada || urgente) ? { background: "rgba(239,68,68,0.08)" } : {}),
                          }}
                        >
                          <td className="px-4 py-3.5 max-w-[280px]">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/app/politico/demandas/${d.id}`}
                                className="font-semibold truncate transition-colors hover:underline"
                                style={{ color: "var(--color-text)" }}
                              >
                                {d.assunto || "Sem assunto"}
                              </Link>
                              {temIA && (
                                <span
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{ background: "#D7F36A", color: "#2E3410" }}
                                >
                                  IA
                                </span>
                              )}
                              {d.pol_autoatendimento && (
                                <span
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                                  style={{ background: "#E7EEF8", color: "#3B5B8C" }}
                                  title="O cidadão foi orientado a resolver pelo link da Prefeitura. Registro de inteligência — não é trabalho do gabinete."
                                >
                                  ✨ autoatendimento
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                            {d.pol_tipo ? d.pol_tipo.replace(/_/g, " ") : "—"}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                            {d.pol_orgao_destino ?? "—"}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {atrasada ? (
                              <span
                                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                                style={{ background: "#FBE4E2", color: "#A3302A" }}
                              >
                                Atrasada
                              </span>
                            ) : (
                              <StatusPill estado={d.estado} />
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {d.prazo_em ? (
                              <span
                                className="text-sm tabular-nums"
                                style={{
                                  color: atrasada ? "#A3302A" : diasPrazo !== null && diasPrazo <= 3 ? "#8A5A10" : "#4A4F59",
                                  fontWeight: atrasada ? 600 : 400,
                                }}
                              >
                                {formatarData(d.prazo_em)}
                                {diasPrazo !== null && !["resolvida", "encerrada"].includes(d.estado) && (
                                  <span className="ml-1 text-xs">
                                    {atrasada
                                      ? `(${Math.abs(diasPrazo)}d atrás)`
                                      : diasPrazo === 0
                                        ? "(hoje)"
                                        : `(${diasPrazo}d)`}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: "var(--color-text-subtle)" }}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {pLabel && pEstilo ? (
                              <span
                                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                                style={{ background: pEstilo.bg, color: pEstilo.color }}
                              >
                                {pLabel}
                              </span>
                            ) : (
                              <span style={{ color: "var(--color-text-subtle)" }}>Normal</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div
              className="flex flex-wrap justify-between items-center gap-3 px-4 py-3.5 text-[13px]"
              style={{ color: "var(--color-text-subtle)", borderTop: "1px solid var(--color-border)" }}
            >
              <span>
                Mostrando {demandas.length} de {total.toLocaleString("pt-BR")}
              </span>
              <div className="flex gap-2">
                {pagina > 1 && (
                  <Link
                    href={`/app/politico/demandas${montarQuery({ pagina: String(pagina - 1) })}`}
                    className="wr-btn text-sm"
                  >
                    Anterior
                  </Link>
                )}
                {pagina < totalPaginas && (
                  <Link
                    href={`/app/politico/demandas${montarQuery({ pagina: String(pagina + 1) })}`}
                    className="wr-btn text-sm"
                  >
                    Próxima
                  </Link>
                )}
              </div>
            </div>
          </section>
        </>
    </div>
  );
}

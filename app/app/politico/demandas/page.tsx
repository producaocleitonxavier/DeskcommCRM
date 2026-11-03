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
import { corDoOrgao, normalizarOrgao, rollupPorOrgao, type DemandaCobranca, type OrgaoRollup } from "@/lib/politico/demanda-cobranca";

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
  pol_prazo_dias: number | null;
  desfecho: string | null;
  pol_autoatendimento?: boolean | null;
  pol_respondeu?: boolean | null;
  pol_respondeu_em?: string | null;
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
    aberta: { bg: "rgba(245,158,11,0.15)", color: "#E4B96E" },
    em_atendimento: { bg: "rgba(129,140,248,0.16)", color: "#A5B4FC" },
    encaminhada: { bg: "rgba(167,139,250,0.16)", color: "#C4B5FD" },
    aguardando_cliente: { bg: "rgba(217,164,75,0.16)", color: "#E4B96E" },
    resolvida: { bg: "rgba(94,195,148,0.16)", color: "#7AD4AB" },
    encerrada: { bg: "rgba(255,255,255,0.07)", color: "var(--color-text-muted)" },
  };
  return mapa[estado] ?? { bg: "rgba(255,255,255,0.07)", color: "var(--color-text-muted)" };
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
    alta: { bg: "rgba(217,164,75,0.14)", color: "#D9A44B" },
    urgente: { bg: "rgba(245,158,11,0.18)", color: "#F0A742" },
  };
  return mapa[prioridade] ?? null;
}

function diasParaPrazo(prazo: string | null): number | null {
  if (!prazo) return null;
  const agora = new Date();
  const prazoDt = new Date(prazo);
  return Math.ceil((prazoDt.getTime() - agora.getTime()) / 86400000);
}

/** Prazo de ATENDIMENTO (padrão 30 dias a partir da abertura; o responsável
 * pode acordar 30/60/90…). "Atrasada" só conta a partir DESTE prazo — não da
 * data da visita. */
const PRAZO_PADRAO_DIAS = 30;
function prazoDeAtendimento(abertaEm: string, prazoDias: number | null): { atrasada: boolean; diasRestantes: number } {
  const dias = prazoDias && prazoDias > 0 ? prazoDias : PRAZO_PADRAO_DIAS;
  const limite = new Date(new Date(abertaEm).getTime() + dias * 86400000);
  const diasRestantes = Math.ceil((limite.getTime() - Date.now()) / 86400000);
  return { atrasada: diasRestantes < 0, diasRestantes };
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

/** A coluna `pol_respondeu` (migration 9084) existe? Se não, a coluna/painel de
 * cobrança por resposta somem — a tela segue funcionando como antes. */
async function colunaRespondeuExiste(organizationId: string): Promise<boolean> {
  const db = await createClient();
  const { error } = await db
    .from("demandas")
    .select("pol_respondeu")
    .eq("organization_id", organizationId)
    .limit(1);
  return !error;
}

/** Lista dos órgãos de destino DISTINTOS das demandas do gabinete (para os
 * chips de filtro). Leve: só a coluna, dedupe em memória. */
async function buscarOrgaos(organizationId: string, temAuto: boolean): Promise<string[]> {
  const db = await createClient();
  let q = db
    .from("demandas")
    .select("pol_orgao_destino")
    .eq("organization_id", organizationId)
    .eq("pol_gabinete", true)
    .not("pol_orgao_destino", "is", null)
    .limit(1000);
  if (temAuto) q = q.eq("pol_autoatendimento", false);
  const { data } = await q;
  const set = new Set<string>();
  for (const r of (data ?? []) as { pol_orgao_destino: string | null }[]) {
    const o = normalizarOrgao(r.pol_orgao_destino);
    if (o) set.add(o);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Rollup "por órgão" (total, atrasadas, sem resposta) de TODAS as demandas do
 * gabinete — alimenta o painel de cobrança. Fail-soft se a coluna não existe. */
async function buscarRollupOrgaos(organizationId: string, temAuto: boolean, temRespondeu: boolean): Promise<OrgaoRollup[]> {
  const db = await createClient();
  const cols = "pol_orgao_destino, estado, aberta_em, pol_prazo_dias" + (temRespondeu ? ", pol_respondeu" : "");
  let q = db
    .from("demandas")
    .select(cols)
    .eq("organization_id", organizationId)
    .eq("pol_gabinete", true)
    .not("pol_orgao_destino", "is", null)
    .limit(1000);
  if (temAuto) q = q.eq("pol_autoatendimento", false);
  const { data } = await q;
  const itens: DemandaCobranca[] = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    orgao: (r.pol_orgao_destino as string | null) ?? null,
    estado: String(r.estado ?? ""),
    abertaEm: String(r.aberta_em ?? new Date().toISOString()),
    prazoDias: (r.pol_prazo_dias as number | null) ?? null,
    respondeu: temRespondeu ? (r.pol_respondeu as boolean | null) === true : false,
  }));
  return rollupPorOrgao(itens);
}

async function buscarDemandas(
  organizationId: string,
  pagina: number,
  filtroEstado: string | undefined,
  filtroOrgao: string | undefined,
  opts: { temAuto: boolean; verAuto: boolean; temRespondeu: boolean },
) {
  const db = await createClient();
  const offset = (pagina - 1) * POR_PAGINA;

  const colunas =
    "id, assunto, estado, origem, pol_tipo, pol_prioridade, pol_orgao_destino, pol_encaminhamento_ia, dono_kind, aberta_em, prazo_em, pol_prazo_dias, desfecho" +
    (opts.temAuto ? ", pol_autoatendimento" : "") +
    (opts.temRespondeu ? ", pol_respondeu, pol_respondeu_em" : "");

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
  if (filtroOrgao) {
    query = query.eq("pol_orgao_destino", filtroOrgao);
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
  const filtroOrgao = typeof params.orgao === "string" ? params.orgao : undefined;

  // Camada "A IA orientou" (autoatendimento): existe só se a migration 9072 rodou.
  const temAuto = await colunaAutoExiste(org.orgId);
  const verAuto = temAuto && params.view === "autoatendimento";
  // Cobrança por resposta do órgão: existe só se a migration 9084 rodou.
  const temRespondeu = await colunaRespondeuExiste(org.orgId);

  const [{ demandas, total }, contagens, orgaos, rollupOrgaos] = await Promise.all([
    buscarDemandas(org.orgId, pagina, filtroEstado, filtroOrgao, { temAuto, verAuto, temRespondeu }),
    contarEstados(org.orgId, temAuto),
    buscarOrgaos(org.orgId, temAuto),
    buscarRollupOrgaos(org.orgId, temAuto, temRespondeu),
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
    const merged = { estado: filtroEstado, orgao: filtroOrgao, view: viewAtual, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header card ─────────────────────────────────────────── */}
      <header className="gip-glass p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4">
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

          {/* Painel COBRANÇA POR ÓRGÃO — bate o olho e vê onde cobrar. */}
          {!verAuto && rollupOrgaos.length > 0 && (
            <section aria-label="Demandas por órgão" className="gip-glass p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Por órgão</h2>
                <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>clique pra filtrar · onde cobrar</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {rollupOrgaos.slice(0, 8).map((o) => {
                  const cor = corDoOrgao(o.orgao);
                  const ativo = filtroOrgao === o.orgao;
                  return (
                    <Link
                      key={o.orgao}
                      href={`/app/politico/demandas${montarQuery({ orgao: ativo ? undefined : o.orgao, pagina: "1" })}`}
                      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
                      style={{ background: "var(--color-surface-elevated)", border: ativo ? "1px solid rgba(215,243,106,0.5)" : "1px solid var(--color-border)" }}
                    >
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: cor.bg, color: cor.color }}>
                        {o.orgao}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
                        <span style={{ color: "var(--color-text-muted)" }}>{o.total}</span>
                        {o.atrasadas > 0 && (
                          <span className="rounded-full px-1.5 py-0.5 font-bold" style={{ background: "rgba(239,68,68,0.16)", color: "#F87171" }}>
                            {o.atrasadas} atrasada{o.atrasadas > 1 ? "s" : ""}
                          </span>
                        )}
                        {temRespondeu && o.semResposta > 0 && (
                          <span className="rounded-full px-1.5 py-0.5 font-semibold" style={{ background: "rgba(245,158,11,0.16)", color: "#E4B96E" }}>
                            {o.semResposta} s/ resposta
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Demandas table */}
          <section aria-label="Lista de demandas" className="gip-glass pt-2 pb-0 px-0">
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

            {/* Filtro por ÓRGÃO (etiquetas coloridas dos órgãos presentes) */}
            {orgaos.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-4 pb-3.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Órgão:</span>
                <Link
                  href={`/app/politico/demandas${montarQuery({ orgao: undefined, pagina: "1" })}`}
                  className="inline-flex items-center h-8 px-3 rounded-full text-xs font-medium transition-colors"
                  style={!filtroOrgao ? { background: "#16181D", color: "#FFFFFF" } : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
                >
                  Todos
                </Link>
                {orgaos.map((o) => {
                  const cor = corDoOrgao(o);
                  const ativo = filtroOrgao === o;
                  return (
                    <Link
                      key={o}
                      href={`/app/politico/demandas${montarQuery({ orgao: ativo ? undefined : o, pagina: "1" })}`}
                      className="inline-flex items-center h-8 rounded-full px-3 text-xs font-semibold transition-opacity hover:opacity-90"
                      style={{ background: cor.bg, color: cor.color, outline: ativo ? "2px solid rgba(215,243,106,0.6)" : "none" }}
                    >
                      {o}
                    </Link>
                  );
                })}
              </div>
            )}

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
                      {["Demanda", "Tipo", "Órgão destino", "Status", "Visita", "Prioridade", ...(temRespondeu ? ["Respondeu?"] : [])].map((col) => (
                        <th
                          key={col}
                          className="text-left font-semibold text-[11px] uppercase tracking-wide px-4 py-3 whitespace-nowrap border-b"
                          style={{ color: "var(--color-text-muted)", borderColor: "color-mix(in srgb, var(--color-text) 7%, transparent)" }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {demandas.map((d) => {
                      const diasPrazo = diasParaPrazo(d.prazo_em); // data da VISITA (informativo)
                      const prazoInfo = prazoDeAtendimento(d.aberta_em, d.pol_prazo_dias);
                      const atrasada = prazoInfo.atrasada && !["resolvida", "encerrada"].includes(d.estado);
                      const pLabel = prioridadeLabel(d.pol_prioridade);
                      const pEstilo = prioridadeEstilo(d.pol_prioridade);
                      const temIA = !!d.pol_encaminhamento_ia;
                      const orgaoNome = normalizarOrgao(d.pol_orgao_destino);
                      const orgaoCor = corDoOrgao(orgaoNome);
                      const fechadaRow = ["resolvida", "encerrada"].includes(d.estado);

                      return (
                        <tr
                          key={d.id}
                          className="group transition-colors hover:bg-white/[0.04]"
                          style={{ borderBottom: "1px solid color-mix(in srgb, var(--color-text) 7%, transparent)" }}
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
                                  style={{ background: "rgba(96,165,250,0.15)", color: "#93B4EA" }}
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
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {orgaoNome ? (
                              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: orgaoCor.bg, color: orgaoCor.color }}>
                                {orgaoNome}
                              </span>
                            ) : (
                              <span style={{ color: "var(--color-text-subtle)" }}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusPill estado={d.estado} />
                              {atrasada && (
                                <span
                                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                                  style={{ background: "rgba(239,68,68,0.16)", color: "#F87171" }}
                                  title={`Passou do prazo acordado (${d.pol_prazo_dias ?? 30} dias)`}
                                >
                                  Atrasada {Math.abs(prazoInfo.diasRestantes)}d
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {d.prazo_em ? (
                              <span
                                className="text-sm tabular-nums"
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                {formatarData(d.prazo_em)}
                                {diasPrazo !== null && !["resolvida", "encerrada"].includes(d.estado) && (
                                  <span className="ml-1 text-xs">
                                    {diasPrazo < 0
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
                          {temRespondeu && (
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {d.pol_respondeu ? (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(34,197,94,0.15)", color: "#7AD4AB" }}>
                                  Sim{d.pol_respondeu_em ? ` · ${formatarData(d.pol_respondeu_em)}` : ""}
                                </span>
                              ) : fechadaRow ? (
                                <span style={{ color: "var(--color-text-subtle)" }}>—</span>
                              ) : (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(239,68,68,0.14)", color: "#F87171" }}>
                                  Não
                                </span>
                              )}
                            </td>
                          )}
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
              style={{ color: "var(--color-text-subtle)", borderTop: "1px solid color-mix(in srgb, var(--color-text) 7%, transparent)" }}
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

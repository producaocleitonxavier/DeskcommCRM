/**
 * /app/politico/leads — Pessoas (War Room 2.0)
 *
 * Tabela paginada de pol_leads com join em contacts (nome, telefone, origem).
 * Funil de etapas com contadores, busca, filtros por cidade/origem.
 * Link para ficha individual.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/get-user";
import { resolverOrganizacaoAtiva } from "@/lib/organizations/resolver";

// -- Constantes --------------------------------------------------------------

const POR_PAGINA = 25;

const ETAPAS_FUNIL = [
  { value: "novo_cadastro", label: "Novo contato", cor: "var(--wr-funnel-1)", pillClass: "f1" },
  { value: "simpatizante", label: "Simpatizante", cor: "var(--wr-funnel-2)", pillClass: "f2" },
  { value: "apoiador", label: "Apoiador", cor: "var(--wr-funnel-3)", pillClass: "f3" },
  { value: "militante", label: "Multiplicador", cor: "var(--wr-funnel-4)", pillClass: "f4" },
  { value: "voto_certo", label: "Voto certo", cor: "var(--wr-funnel-5)", pillClass: "f5" },
] as const;

// -- Helpers -----------------------------------------------------------------

function labelDaEtapa(value: string): string {
  return ETAPAS_FUNIL.find((e) => e.value === value)?.label ?? value;
}

function pillClassDaEtapa(value: string): string {
  return ETAPAS_FUNIL.find((e) => e.value === value)?.pillClass ?? "f1";
}

function corDaEtapa(value: string): string {
  return ETAPAS_FUNIL.find((e) => e.value === value)?.cor ?? "var(--wr-funnel-1)";
}

function labelDaOrigem(value: string): string {
  const mapa: Record<string, string> = {
    manual: "Manual",
    import: "Importação",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    form: "Formulário",
    abaixo_assinado: "Abaixo-assinado",
    palestra: "Palestra",
    campo: "Campo",
    pesquisa: "Pesquisa",
    ebook: "E-book",
  };
  return mapa[value] ?? value;
}

function tempoRelativo(data: string | null): string {
  if (!data) return "—";
  const agora = Date.now();
  const ts = new Date(data).getTime();
  const diffMs = agora - ts;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffH < 24) return `há ${diffH}h`;
  if (diffD === 0) return "hoje";
  if (diffD === 1) return "ontem";
  if (diffD < 30) return `há ${diffD} dias`;
  return `há ${Math.floor(diffD / 30)} meses`;
}

// -- Tipos -------------------------------------------------------------------

interface LeadRow {
  id: string;
  support_level: string;
  temperature: string;
  political_score: number;
  territory_id: string | null;
  created_at: string;
  contacts: {
    name: string | null;
    phone_number: string | null;
    source: string | null;
    last_activity_at: string | null;
  } | null;
  pol_territories: {
    name: string;
  } | null;
}

// -- Data fetching -----------------------------------------------------------

async function buscarLeads(
  organizationId: string,
  pagina: number,
  etapa?: string,
  busca?: string,
) {
  const db = createServerClient();
  const offset = (pagina - 1) * POR_PAGINA;

  let query = db
    .from("pol_leads")
    .select(
      "id, support_level, temperature, political_score, territory_id, created_at, contacts(name, phone_number, source, last_activity_at), pol_territories(name)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(offset, offset + POR_PAGINA - 1);

  if (etapa) {
    query = query.eq("support_level", etapa);
  }

  if (busca) {
    query = query.ilike("contacts.name", `%${busca}%`);
  }

  const { data, count } = await query;

  return {
    leads: (data as unknown as LeadRow[]) ?? [],
    total: count ?? 0,
  };
}

async function contarPorEtapa(organizationId: string) {
  const db = createServerClient();
  const counts: Record<string, number> = {};

  // Total
  const { count: totalCount } = await db
    .from("pol_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  counts._total = totalCount ?? 0;

  // Por etapa
  for (const etapa of ETAPAS_FUNIL) {
    const { count } = await db
      .from("pol_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("support_level", etapa.value);
    counts[etapa.value] = count ?? 0;
  }

  return counts;
}

// -- Sub-componentes ---------------------------------------------------------

function EtapaCard({
  label,
  count,
  cor,
  active,
  href,
}: {
  label: string;
  count: number;
  cor?: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex-1 min-w-[140px] text-left rounded-[20px] p-4 transition-colors"
      style={{
        background: active ? "#D7F36A" : "#FFFFFF",
        boxShadow: "var(--wr-card-shadow)",
      }}
    >
      <div className="flex items-center gap-2 text-[13px]" style={{ color: active ? "#2E3410" : "#4A4F59" }}>
        {cor && (
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: cor }}
          />
        )}
        {label}
      </div>
      <div
        className="font-heading text-[28px] font-bold mt-0.5 tabular-nums"
        style={{ color: active ? "#2E3410" : "var(--color-text)" }}
      >
        {count.toLocaleString("pt-BR")}
      </div>
    </Link>
  );
}

function EtapaPill({ value }: { value: string }) {
  const cls = pillClassDaEtapa(value);
  // Map pill classes to inline styles to match design
  const pillStyles: Record<string, { bg: string; color: string }> = {
    f1: { bg: "#EEF0FB", color: "#3B4280" },
    f2: { bg: "#DDE1F7", color: "#2F3DA8" },
    f3: { bg: "#B4BCF0", color: "#1E2A80" },
    f4: { bg: "#4352C4", color: "#FFFFFF" },
    f5: { bg: "#26318F", color: "#FFFFFF" },
  };
  const s = pillStyles[cls] ?? pillStyles.f1;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {labelDaEtapa(value)}
    </span>
  );
}

// -- Componente principal ----------------------------------------------------

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const org = await resolverOrganizacaoAtiva(user.id);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const etapa = typeof params.etapa === "string" ? params.etapa : undefined;
  const busca = typeof params.busca === "string" ? params.busca : undefined;

  const [{ leads, total }, contagens] = await Promise.all([
    buscarLeads(org.id, pagina, etapa, busca),
    contarPorEtapa(org.id),
  ]);

  const totalPaginas = Math.ceil(total / POR_PAGINA);

  function montarQuery(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { etapa, busca, ...overrides };
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
          <h1 className="font-heading text-[36px] font-bold leading-tight">Pessoas</h1>
          <p className="mt-1.5 text-base" style={{ color: "#4A4F59" }}>
            Toda a base em um lugar. Clique numa etapa para filtrar, num nome para abrir a ficha.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 items-center">
          {/* View toggles */}
          <div role="group" aria-label="Visualização" className="flex gap-1">
            <button
              type="button"
              aria-pressed="true"
              aria-label="Tabela"
              className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border font-semibold text-sm"
              style={{ background: "#16181D", color: "#FFFFFF", borderColor: "#16181D" }}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
            </button>
            <button
              type="button"
              aria-pressed="false"
              aria-label="Kanban"
              className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border font-semibold text-sm"
              style={{ background: "#FFFFFF", color: "#4A4F59", borderColor: "#DCDCD5" }}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="5" height="18" rx="1" />
                <rect x="10" y="3" width="5" height="12" rx="1" />
                <rect x="17" y="3" width="5" height="15" rx="1" />
              </svg>
            </button>
          </div>
          <button type="button" className="wr-btn">Importar</button>
          <button type="button" className="wr-btn">Exportar</button>
          <Link href="/app/politico/leads/novo" className="wr-btn-dark">
            + Novo cadastro
          </Link>
        </div>
      </header>

      {/* ── Funnel stage cards ──────────────────────────────────── */}
      <section aria-label="Etapas do funil" className="flex flex-wrap gap-3">
        <EtapaCard
          label="Todas"
          count={contagens._total}
          active={!etapa}
          href={`/app/politico/leads${montarQuery({ etapa: undefined, pagina: "1" })}`}
        />
        {ETAPAS_FUNIL.map((e) => (
          <EtapaCard
            key={e.value}
            label={e.label}
            count={contagens[e.value] ?? 0}
            cor={e.cor}
            active={etapa === e.value}
            href={`/app/politico/leads${montarQuery({ etapa: e.value, pagina: "1" })}`}
          />
        ))}
      </section>

      {/* ── Data table card ─────────────────────────────────────── */}
      <section aria-label="Lista de pessoas" className="wr-card pt-2 pb-0 px-0">
        {/* Search + filters */}
        <div className="flex flex-wrap gap-2.5 px-4 py-3.5">
          <form className="flex-1 basis-[280px]" action="/app/politico/leads" method="get">
            {etapa && <input type="hidden" name="etapa" value={etapa} />}
            <label className="flex items-center gap-2.5 min-h-[44px] h-11 px-4 rounded-full" style={{ background: "#F6F6F2" }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B606B" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                name="busca"
                placeholder="Nome, telefone ou bairro"
                defaultValue={busca ?? ""}
                className="flex-1 min-w-0 bg-transparent border-0 text-sm outline-none placeholder:text-[#9A9D8F]"
                style={{ color: "#16181D" }}
              />
            </label>
          </form>
        </div>

        {/* Table */}
        {leads.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm" style={{ color: "#5B606B" }}>
              Nenhuma pessoa encontrada.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b" style={{ color: "#5B606B", borderColor: "#ECECE7" }}>
                    Nome
                  </th>
                  <th className="text-left font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b" style={{ color: "#5B606B", borderColor: "#ECECE7" }}>
                    Território
                  </th>
                  <th className="text-left font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b" style={{ color: "#5B606B", borderColor: "#ECECE7" }}>
                    Etapa
                  </th>
                  <th className="text-right font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b" style={{ color: "#5B606B", borderColor: "#ECECE7" }}>
                    Engaj.
                  </th>
                  <th className="text-left font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b" style={{ color: "#5B606B", borderColor: "#ECECE7" }}>
                    Última interação
                  </th>
                  <th className="text-left font-medium text-[13px] px-4 py-3 whitespace-nowrap border-b" style={{ color: "#5B606B", borderColor: "#ECECE7" }}>
                    Origem
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const lastActivity = lead.contacts?.last_activity_at;
                  const daysSinceActivity = lastActivity
                    ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
                    : null;
                  const stale = daysSinceActivity !== null && daysSinceActivity >= 7;

                  return (
                    <tr
                      key={lead.id}
                      className="group transition-colors hover:bg-[#F6F6F2]"
                      style={{
                        borderBottom: "1px solid #F0F0EB",
                        ...(lead.political_score >= 70 ? { background: "#FAFDEB" } : {}),
                      }}
                    >
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Link
                          href={`/app/politico/leads/${lead.id}`}
                          className="font-semibold hover:underline"
                          style={{ color: "#16181D" }}
                        >
                          {lead.contacts?.name ?? "Sem nome"}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap" style={{ color: "#4A4F59" }}>
                        {lead.pol_territories?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <EtapaPill value={lead.support_level} />
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-bold font-heading">
                        {lead.political_score}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {stale ? (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                            style={{ background: "#FCF1DC", color: "#8A5A10" }}
                          >
                            Sem contato há {daysSinceActivity} dias
                          </span>
                        ) : (
                          <span style={{ color: "#4A4F59" }}>
                            {tempoRelativo(lastActivity)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap" style={{ color: "#4A4F59" }}>
                        {labelDaOrigem(lead.contacts?.source ?? "manual")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-wrap justify-between items-center gap-3 px-4 py-3.5 text-[13px]" style={{ color: "#5B606B" }}>
          <span>
            Mostrando {leads.length} de {total.toLocaleString("pt-BR")}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link
                href={`/app/politico/leads${montarQuery({ pagina: String(pagina - 1) })}`}
                className="wr-btn text-sm"
              >
                Anterior
              </Link>
            )}
            {pagina < totalPaginas && (
              <Link
                href={`/app/politico/leads${montarQuery({ pagina: String(pagina + 1) })}`}
                className="wr-btn text-sm"
              >
                Próxima
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * /app/politico/leads/[id] — Ficha do Lead (War Room 2.0)
 *
 * Detalhe completo de um lead político: dados de contato, posição no funil,
 * engajamento, timeline de transições e demandas vinculadas.
 *
 * Acesso: manager+
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/get-user";
import { resolverOrganizacaoAtiva } from "@/lib/organizations/resolver";

// -- Tipos -------------------------------------------------------------------

interface Contact {
  id: string;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  birthdate: string | null;
  source: string | null;
  tags: string[] | null;
  social_identity: string | null;
  last_activity_at: string | null;
  created_at: string;
}

interface PolLead {
  id: string;
  contact_id: string;
  support_level: string;
  political_score: number;
  temperature: string;
  zona_eleitoral: string | null;
  secao_eleitoral: string | null;
  leader_potential: boolean | null;
  community_role: string | null;
  mobilizer_id: string | null;
  territory_id: string | null;
  created_at: string;
  updated_at: string;
}

interface FunnelTransition {
  id: string;
  from_level: string | null;
  to_level: string;
  changed_at: string;
  reason: string | null;
}

interface Demanda {
  id: string;
  assunto: string | null;
  estado: string;
  pol_prioridade: string | null;
  aberta_em: string;
  prazo_em: string | null;
}

// -- Helpers -----------------------------------------------------------------

const ETAPAS_FUNIL = [
  { value: "novo_cadastro", label: "Novo cadastro", idx: 0 },
  { value: "simpatizante", label: "Simpatizante", idx: 1 },
  { value: "apoiador", label: "Apoiador", idx: 2 },
  { value: "militante", label: "Militante", idx: 3 },
  { value: "voto_certo", label: "Voto certo", idx: 4 },
] as const;

function etapaLabel(value: string): string {
  return ETAPAS_FUNIL.find((e) => e.value === value)?.label ?? value;
}

function etapaIdx(value: string): number {
  return ETAPAS_FUNIL.find((e) => e.value === value)?.idx ?? 0;
}

function etapaCor(value: string): string {
  const mapa: Record<string, string> = {
    novo_cadastro: "var(--wr-funnel-1)",
    simpatizante: "var(--wr-funnel-2)",
    apoiador: "var(--wr-funnel-3)",
    militante: "var(--wr-funnel-4)",
    voto_certo: "var(--wr-funnel-5)",
  };
  return mapa[value] ?? "var(--wr-funnel-1)";
}

function etapaPillEstilo(value: string): { bg: string; color: string } {
  const mapa: Record<string, { bg: string; color: string }> = {
    novo_cadastro: { bg: "#EEF0FB", color: "#3B4280" },
    simpatizante: { bg: "#DDE1F7", color: "#2F3DA8" },
    apoiador: { bg: "#B4BCF0", color: "#1E2A80" },
    militante: { bg: "#4352C4", color: "#FFFFFF" },
    voto_certo: { bg: "#26318F", color: "#FFFFFF" },
  };
  return mapa[value] ?? { bg: "#EEF0FB", color: "#3B4280" };
}

function tempLabel(temp: string): string {
  const m: Record<string, string> = { frio: "Frio", morno: "Morno", quente: "Quente" };
  return m[temp] ?? temp;
}

function tempEstilo(temp: string): { bg: string; color: string } {
  const m: Record<string, { bg: string; color: string }> = {
    frio: { bg: "#E4E7F8", color: "#2F3DA8" },
    morno: { bg: "#FCF1DC", color: "#8A5A10" },
    quente: { bg: "#FBE4E2", color: "#A3302A" },
  };
  return m[temp] ?? { bg: "#F0F0EB", color: "#4A4F59" };
}

function estadoDemandaEstilo(estado: string): { bg: string; color: string } {
  const m: Record<string, { bg: string; color: string }> = {
    aberta: { bg: "#F0F0EB", color: "#4A4F59" },
    em_atendimento: { bg: "#E4E7F8", color: "#2F3DA8" },
    aguardando_cliente: { bg: "#FCF1DC", color: "#8A5A10" },
    resolvida: { bg: "#E2F5EC", color: "#17784F" },
    encerrada: { bg: "#F0F0EB", color: "#5B606B" },
  };
  return m[estado] ?? { bg: "#F0F0EB", color: "#4A4F59" };
}

function estadoDemandaLabel(estado: string): string {
  const m: Record<string, string> = {
    aberta: "Nova",
    em_atendimento: "Em atendimento",
    aguardando_cliente: "Aguardando",
    resolvida: "Resolvida",
    encerrada: "Encerrada",
  };
  return m[estado] ?? estado;
}

function formatarData(data: string): string {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatarDataCurta(data: string): string {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function sourceLabel(source: string | null): string {
  if (!source) return "Manual";
  const m: Record<string, string> = {
    manual: "Manual",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    import: "Importação",
    api: "API",
    form: "Formulário",
  };
  return m[source] ?? source;
}

function iniciais(name: string | null): string {
  if (!name) return "?";
  const partes = name.trim().split(/\s+/);
  if (partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// -- Data fetching -----------------------------------------------------------

async function buscarLead(organizationId: string, leadId: string) {
  const db = createServerClient();

  // Buscar pol_lead
  const { data: lead } = await db
    .from("pol_leads")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", leadId)
    .single();

  if (!lead) return null;

  // Buscar contato
  const { data: contact } = await db
    .from("contacts")
    .select("id, name, phone_number, email, birthdate, source, tags, social_identity, last_activity_at, created_at")
    .eq("id", (lead as PolLead).contact_id)
    .single();

  if (!contact) return null;

  // Buscar transições de funil
  const { data: transitions } = await db
    .from("pol_funnel_transitions")
    .select("id, from_level, to_level, changed_at, reason")
    .eq("organization_id", organizationId)
    .eq("contact_id", (lead as PolLead).contact_id)
    .order("changed_at", { ascending: false })
    .limit(20);

  // Buscar demandas vinculadas (por contact_id em demandas)
  // Demandas podem ter um campo de vínculo — tentamos pelo dono_kind/contato
  const { data: demandas } = await db
    .from("demandas")
    .select("id, assunto, estado, pol_prioridade, aberta_em, prazo_em")
    .eq("organization_id", organizationId)
    .order("aberta_em", { ascending: false })
    .limit(5);

  // Buscar mobilizador se existir
  let mobilizadorNome: string | null = null;
  if ((lead as PolLead).mobilizer_id) {
    const { data: mob } = await db
      .from("contacts")
      .select("name")
      .eq("id", (lead as PolLead).mobilizer_id!)
      .single();
    mobilizadorNome = mob?.name ?? null;
  }

  return {
    lead: lead as PolLead,
    contact: contact as Contact,
    transitions: (transitions ?? []) as FunnelTransition[],
    demandas: (demandas ?? []) as Demanda[],
    mobilizadorNome,
  };
}

// -- Sub-componentes ---------------------------------------------------------

function EtapaPill({ value }: { value: string }) {
  const s = etapaPillEstilo(value);
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {etapaLabel(value)}
    </span>
  );
}

function FunilProgresso({ current }: { current: string }) {
  const idx = etapaIdx(current);
  return (
    <div className="flex items-center gap-1.5">
      {ETAPAS_FUNIL.map((etapa) => {
        const ativo = etapa.idx <= idx;
        return (
          <div key={etapa.value} className="flex items-center gap-1.5">
            <div
              className="flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                width: 28,
                height: 28,
                background: ativo ? etapaCor(etapa.value) : "#F0F0EB",
                color: ativo && etapa.idx >= 3 ? "#FFFFFF" : ativo ? "#1E2A80" : "#9A9D8F",
              }}
            >
              {etapa.idx + 1}
            </div>
            {etapa.idx < ETAPAS_FUNIL.length - 1 && (
              <div
                className="h-[3px] rounded-full"
                style={{
                  width: 20,
                  background: etapa.idx < idx ? etapaCor(ETAPAS_FUNIL[etapa.idx + 1].value) : "#F0F0EB",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function InfoCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="wr-card p-5" style={{ minHeight: 120 }}>
      <h3
        className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3"
        style={{ color: "#9A9D8F" }}
      >
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-1.5 text-sm">
      <span style={{ color: "#5B606B" }}>{label}</span>
      <span className="text-right font-medium" style={{ color: "#16181D" }}>
        {value || <span style={{ color: "#9A9D8F" }}>—</span>}
      </span>
    </div>
  );
}

// -- Componente principal ----------------------------------------------------

export default async function FichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const org = await resolverOrganizacaoAtiva(user.id);
  if (!org) redirect("/app/onboarding");

  const { id } = await params;
  const dados = await buscarLead(org.id, id);

  if (!dados) notFound();

  const { lead, contact, transitions, demandas, mobilizadorNome } = dados;

  const tempS = tempEstilo(lead.temperature);

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Voltar ──────────────────────────────────────────────── */}
      <Link
        href="/app/politico/leads"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
        style={{ color: "#5B606B" }}
      >
        ← Pessoas
      </Link>

      {/* ── Header card ─────────────────────────────────────────── */}
      <header className="wr-card p-6 sm:p-7">
        <div className="flex flex-wrap items-start gap-5">
          {/* Avatar */}
          <div
            className="flex items-center justify-center rounded-full font-heading font-bold text-lg shrink-0"
            style={{
              width: 56,
              height: 56,
              background: etapaCor(lead.support_level),
              color: etapaIdx(lead.support_level) >= 3 ? "#FFFFFF" : "#1E2A80",
            }}
          >
            {iniciais(contact.name)}
          </div>

          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-[28px] font-bold leading-tight truncate">
              {contact.name || "Sem nome"}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5 mt-2">
              <EtapaPill value={lead.support_level} />
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: tempS.bg, color: tempS.color }}
              >
                {tempLabel(lead.temperature)}
              </span>
              {lead.leader_potential && (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{ background: "#D7F36A", color: "#2E3410" }}
                >
                  Líder
                </span>
              )}
              <span className="text-xs tabular-nums" style={{ color: "#5B606B" }}>
                Score: {lead.political_score}
              </span>
            </div>
          </div>

          {/* Funil progresso */}
          <div className="hidden sm:block">
            <FunilProgresso current={lead.support_level} />
            <div className="text-[11px] text-center mt-1.5" style={{ color: "#9A9D8F" }}>
              Etapa {etapaIdx(lead.support_level) + 1} de {ETAPAS_FUNIL.length}
            </div>
          </div>
        </div>
      </header>

      {/* ── Grid de cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contato */}
        <InfoCard titulo="Contato">
          <InfoRow label="Telefone" value={contact.phone_number} />
          <InfoRow label="Email" value={contact.email} />
          <InfoRow
            label="Nascimento"
            value={contact.birthdate ? formatarData(contact.birthdate) : null}
          />
          <InfoRow label="Origem" value={sourceLabel(contact.source)} />
          {contact.social_identity && (
            <InfoRow label="Social" value={contact.social_identity} />
          )}
        </InfoCard>

        {/* Território */}
        <InfoCard titulo="Território eleitoral">
          <InfoRow label="Zona" value={lead.zona_eleitoral} />
          <InfoRow label="Seção" value={lead.secao_eleitoral} />
          <InfoRow label="Papel comunitário" value={lead.community_role} />
          <InfoRow label="Mobilizador" value={mobilizadorNome} />
        </InfoCard>

        {/* Engajamento */}
        <InfoCard titulo="Engajamento">
          <InfoRow label="Temperatura" value={
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: tempS.bg, color: tempS.color }}
            >
              {tempLabel(lead.temperature)}
            </span>
          } />
          <InfoRow label="Score político" value={lead.political_score} />
          <InfoRow
            label="Última atividade"
            value={contact.last_activity_at ? formatarData(contact.last_activity_at) : null}
          />
          <InfoRow label="Cadastrado em" value={formatarData(lead.created_at)} />
          {contact.tags && contact.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ background: "#F0F0EB", color: "#4A4F59" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </InfoCard>

        {/* Linha do tempo (transições de funil) */}
        <InfoCard titulo="Linha do tempo">
          {transitions.length === 0 ? (
            <p className="text-sm" style={{ color: "#9A9D8F" }}>
              Nenhuma transição registrada.
            </p>
          ) : (
            <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
              {transitions.map((t) => (
                <div key={t.id} className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ background: etapaCor(t.to_level) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      {t.from_level && (
                        <>
                          <span className="font-medium" style={{ color: "#5B606B" }}>
                            {etapaLabel(t.from_level)}
                          </span>
                          <span style={{ color: "#9A9D8F" }}>→</span>
                        </>
                      )}
                      <span className="font-semibold" style={{ color: "#16181D" }}>
                        {etapaLabel(t.to_level)}
                      </span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#9A9D8F" }}>
                      {formatarDataCurta(t.changed_at)}
                      {t.reason && ` · ${t.reason}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </InfoCard>
      </div>

      {/* ── Demandas vinculadas ─────────────────────────────────── */}
      <section className="wr-card pt-4 pb-0 px-0">
        <div className="flex items-center justify-between px-5 pb-3">
          <h3
            className="text-[11px] font-semibold uppercase tracking-[.08em]"
            style={{ color: "#9A9D8F" }}
          >
            Demandas recentes
          </h3>
          <Link
            href="/app/politico/demandas"
            className="text-xs font-medium hover:opacity-70 transition-colors"
            style={{ color: "#4352C4" }}
          >
            Ver todas →
          </Link>
        </div>

        {demandas.length === 0 ? (
          <div className="px-5 pb-5">
            <p className="text-sm" style={{ color: "#9A9D8F" }}>
              Nenhuma demanda registrada.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {["Demanda", "Status", "Prioridade", "Prazo"].map((col) => (
                    <th
                      key={col}
                      className="text-left font-medium text-[13px] px-5 py-2.5 whitespace-nowrap border-b"
                      style={{ color: "#5B606B", borderColor: "#ECECE7" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {demandas.map((d) => {
                  const sE = estadoDemandaEstilo(d.estado);
                  return (
                    <tr
                      key={d.id}
                      className="hover:bg-[#F6F6F2] transition-colors"
                      style={{ borderBottom: "1px solid #F0F0EB" }}
                    >
                      <td className="px-5 py-3 font-medium max-w-[260px] truncate" style={{ color: "#16181D" }}>
                        {d.assunto || "Sem assunto"}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ background: sE.bg, color: sE.color }}
                        >
                          {estadoDemandaLabel(d.estado)}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap" style={{ color: "#4A4F59" }}>
                        {d.pol_prioridade ?? "Normal"}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap tabular-nums" style={{ color: "#4A4F59" }}>
                        {d.prazo_em ? formatarDataCurta(d.prazo_em) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * /app/politico/leads/[id] — Ficha do Lead (War Room 2.0)
 *
 * Detalhe completo de um lead político: dados de contato, posição no funil,
 * engajamento e timeline de transições.
 *
 * Acesso: manager+
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, GitBranch, MessageCircle, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import BotaoDescadastro from "./_descadastrar";
import VideoDivulgar, { type VideoItem } from "./_video-divulgar";

export const dynamic = "force-dynamic";

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
  custom_fields: Record<string, unknown> | null;
  is_blocked: boolean | null;
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
  pol_obra_id: string | null;
  pol_emenda_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Procedência da captação, resolvida a partir da obra/emenda vinculada. */
interface OrigemCaptacao {
  tipo: "obra" | "emenda";
  label: string; // ex.: "Reforma do campo União"
  href: string; // link para a ficha da obra/emenda
}

interface FunnelTransition {
  id: string;
  from_level: string | null;
  to_level: string;
  changed_at: string;
  reason: string | null;
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
  return m[temp] ?? { bg: "#F0F0EB", color: "var(--color-text-muted)" };
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
  if (partes.length === 1) return (partes[0]?.[0] ?? "?").toUpperCase();
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

// -- Data fetching -----------------------------------------------------------

async function buscarLead(organizationId: string, leadId: string) {
  const db = await createClient();

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
    .select("id, name, phone_number, email, birthdate, source, tags, social_identity, last_activity_at, created_at, custom_fields, is_blocked")
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

  // Procedência: se o lead foi captado por um link de obra ou emenda, mostra a
  // fonte real ("Reforma do campo União") em vez do genérico "Formulário".
  const pl = lead as PolLead;
  let origemCaptacao: OrigemCaptacao | null = null;
  if (pl.pol_obra_id) {
    const { data: obra } = await db
      .from("pol_obras")
      .select("titulo")
      .eq("organization_id", organizationId)
      .eq("id", pl.pol_obra_id)
      .maybeSingle();
    const titulo = (obra as { titulo?: string } | null)?.titulo;
    if (titulo) {
      origemCaptacao = { tipo: "obra", label: titulo, href: `/app/politico/obras/${pl.pol_obra_id}` };
    }
  } else if (pl.pol_emenda_id) {
    const { data: emenda } = await db
      .from("pol_emendas")
      .select("entidade_beneficiada, descricao, numero, ano")
      .eq("organization_id", organizationId)
      .eq("id", pl.pol_emenda_id)
      .maybeSingle();
    const em = emenda as { entidade_beneficiada?: string | null; descricao?: string | null; numero?: string | null; ano?: number | null } | null;
    const label =
      em?.entidade_beneficiada ||
      em?.descricao ||
      (em?.numero ? `Emenda ${em.numero}${em.ano ? `/${em.ano}` : ""}` : null);
    if (label) {
      origemCaptacao = { tipo: "emenda", label, href: `/app/politico/emendas/${pl.pol_emenda_id}` };
    }
  }

  return {
    lead: pl,
    contact: contact as Contact,
    transitions: (transitions ?? []) as FunnelTransition[],
    mobilizadorNome,
    origemCaptacao,
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
                  background: etapa.idx < idx ? etapaCor(ETAPAS_FUNIL[etapa.idx + 1]?.value ?? "") : "#F0F0EB",
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
    <div className="wr-card wr-hover p-5">
      <h3
        className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3"
        style={{ color: "var(--color-text-subtle)" }}
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
      <span style={{ color: "var(--color-text-subtle)" }}>{label}</span>
      <span className="text-right font-medium" style={{ color: "var(--color-text)" }}>
        {value || <span style={{ color: "var(--color-text-subtle)" }}>—</span>}
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
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const { id } = await params;
  const dados = await buscarLead(org.orgId, id);

  if (!dados) notFound();

  const { lead, contact, transitions, mobilizadorNome, origemCaptacao } = dados;

  // Vídeos da biblioteca (posts do IG) para gerar o link pessoal de divulgação.
  const dbVideos = await createClient();
  const { data: videosData } = await dbVideos
    .from("pol_materiais")
    .select("id, titulo")
    .eq("organization_id", org.orgId)
    .eq("tipo", "video")
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(12);
  const videos: VideoItem[] = ((videosData ?? []) as { id: string; titulo: string }[]).map((v) => ({ id: v.id, titulo: v.titulo }));

  // Cidade/bairro do contato — vários formatos de custom_fields coexistem na base
  // (cadastro novo: cidade/bairro + endereco; demanda/eventos/migração: endereco_gip).
  const cf = ((contact as { custom_fields?: Record<string, unknown> }).custom_fields ?? {}) as Record<string, unknown>;
  const cfEnd = (cf.endereco ?? {}) as Record<string, unknown>;
  const cfGip = (cf.endereco_gip ?? {}) as Record<string, unknown>;
  const txtCf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const cidadeContato = txtCf(cfEnd.cidade) ?? txtCf(cf.cidade) ?? txtCf(cfGip.cidade);
  const bairroContato = txtCf(cfEnd.bairro) ?? txtCf(cf.bairro) ?? txtCf(cfGip.bairro);
  const endereco = {
    cep: txtCf(cfEnd.cep) ?? txtCf(cfGip.cep),
    logradouro: txtCf(cfEnd.logradouro) ?? txtCf(cfGip.logradouro),
    numero: txtCf(cfEnd.numero) ?? txtCf(cfGip.numero),
    complemento: txtCf(cfEnd.complemento) ?? txtCf(cfGip.complemento),
    estado: txtCf(cfEnd.estado) ?? txtCf(cfGip.estado) ?? txtCf(cf.uf) ?? txtCf(cf.estado),
  };
  const temEndereco = !!(endereco.cep || endereco.logradouro || endereco.numero || endereco.complemento || endereco.estado);
  const profissaoContato = txtCf(cf.profissao);
  const quemIndicou = txtCf(cf.quem_indicou);
  const observacoes = txtCf(cf.observacoes);
  const temRelacionamento = !!(quemIndicou || observacoes);

  const tempS = tempEstilo(lead.temperature);
  const telefone = contact.phone_number ?? "";
  const whatsDigits = telefone.replace(/\D/g, "");

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Voltar ──────────────────────────────────────────────── */}
      <Link
        href="/app/politico/leads"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
        style={{ color: "var(--color-text-subtle)" }}
      >
        ← Pessoas
      </Link>

      {/* ── Aviso: descadastrada (opt-out) ──────────────────────── */}
      {contact.is_blocked && (
        <div
          className="wr-card p-4 flex items-start gap-3"
          style={{ background: "#FBE4E2", borderColor: "#F3C9C5" }}
          role="status"
        >
          <span className="font-bold text-sm" style={{ color: "#A3302A" }}>
            Descadastrada
          </span>
          <span className="text-sm" style={{ color: "#8A2A24" }}>
            Esta pessoa pediu para não receber contato. Está fora de WhatsApp, campanhas e follow-up, e
            não aparece na base ativa. O pedido sobrevive a importações futuras (LGPD). Reative só se ela
            voltar a pedir.
          </span>
        </div>
      )}

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
              <span className="text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
                Pontuação: {lead.political_score}
              </span>
            </div>
          </div>

          {/* Funil progresso */}
          <div className="hidden sm:block">
            <FunilProgresso current={lead.support_level} />
            <div className="text-[11px] text-center mt-1.5" style={{ color: "var(--color-text-subtle)" }}>
              Etapa {etapaIdx(lead.support_level) + 1} de {ETAPAS_FUNIL.length}
            </div>
          </div>
        </div>
      </header>

      {/* ── Layout 2 colunas ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coluna esquerda (2/3): dados, território, timeline */}
        <div className="space-y-4 lg:col-span-2">
          <InfoCard titulo="Contato">
            <InfoRow label="Telefone" value={contact.phone_number} />
            <InfoRow label="Email" value={contact.email} />
            <InfoRow label="Cidade" value={cidadeContato} />
            <InfoRow label="Bairro" value={bairroContato} />
            <InfoRow label="Nascimento" value={contact.birthdate ? formatarData(contact.birthdate) : null} />
            <InfoRow label="Profissão" value={profissaoContato} />
            <InfoRow label="Origem" value={sourceLabel(contact.source)} />
            {origemCaptacao && (
              <InfoRow
                label="Captado via"
                value={
                  <Link
                    href={origemCaptacao.href}
                    className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
                    style={{ color: "#4352C4" }}
                  >
                    <span className="truncate max-w-[220px]">
                      {origemCaptacao.tipo === "obra" ? "Obra · " : "Emenda · "}
                      {origemCaptacao.label}
                    </span>
                    <ArrowUpRight style={{ width: 13, height: 13 }} className="shrink-0" />
                  </Link>
                }
              />
            )}
            {contact.social_identity && <InfoRow label="Social" value={contact.social_identity} />}
          </InfoCard>

          {temEndereco && (
            <InfoCard titulo="Endereço completo">
              <InfoRow label="CEP" value={endereco.cep} />
              <InfoRow label="Logradouro" value={endereco.logradouro} />
              <InfoRow label="Número" value={endereco.numero} />
              <InfoRow label="Complemento" value={endereco.complemento} />
              <InfoRow label="Bairro" value={bairroContato} />
              <InfoRow label="Cidade" value={cidadeContato} />
              <InfoRow label="Estado" value={endereco.estado} />
            </InfoCard>
          )}

          <InfoCard titulo="Comunidade & mobilização">
            <InfoRow label="Papel comunitário" value={lead.community_role} />
            <InfoRow label="Potencial multiplicador" value={lead.leader_potential ? "Sim" : null} />
            <InfoRow label="Mobilizador" value={mobilizadorNome} />
          </InfoCard>

          {temRelacionamento && (
            <InfoCard titulo="Relacionamento">
              <InfoRow label="Quem indicou" value={quemIndicou} />
              <InfoRow label="Observações" value={observacoes} />
            </InfoCard>
          )}

          <InfoCard titulo="Linha do tempo">
            {transitions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhuma transição registrada.</p>
            ) : (
              <div className="space-y-3">
                {transitions.map((t) => (
                  <div key={t.id} className="flex items-start gap-3">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                      style={{ background: etapaCor(t.to_level), color: etapaIdx(t.to_level) >= 3 ? "#FFFFFF" : "#1E2A80" }}
                      aria-hidden
                    >
                      <ArrowUpRight style={{ width: 15, height: 15 }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        {t.from_level && (
                          <>
                            <span className="font-medium" style={{ color: "var(--color-text-subtle)" }}>{etapaLabel(t.from_level)}</span>
                            <span style={{ color: "var(--color-text-subtle)" }}>→</span>
                          </>
                        )}
                        <span className="font-semibold" style={{ color: "var(--color-text)" }}>{etapaLabel(t.to_level)}</span>
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
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

        {/* Coluna direita (1/3): ações, KPIs, funil, tags */}
        <div className="space-y-4">
          {/* Ações rápidas */}
          <div className="wr-card p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3" style={{ color: "var(--color-text-subtle)" }}>Ações rápidas</h3>
            <div className="flex flex-col gap-2.5">
              {whatsDigits && (
                <a href={`https://wa.me/${whatsDigits}`} target="_blank" rel="noopener noreferrer" className="wr-btn w-full justify-center">
                  <MessageCircle style={{ width: 16, height: 16 }} /> Enviar WhatsApp
                </a>
              )}
              <Link href={`/app/politico/leads/${lead.id}/editar`} className="wr-btn w-full justify-center">
                <Pencil style={{ width: 16, height: 16 }} /> Editar
              </Link>
              <Link href="/app/politico/funil" className="wr-btn w-full justify-center">
                <GitBranch style={{ width: 16, height: 16 }} /> Mover no funil
              </Link>
              <div className="border-t pt-2.5 mt-0.5" style={{ borderColor: "var(--color-border)" }}>
                <BotaoDescadastro contactId={contact.id} leadId={lead.id} bloqueado={!!contact.is_blocked} />
              </div>
            </div>
          </div>

          {/* Vídeo pra divulgar — link pessoal rastreável (alcance do multiplicador) */}
          {!contact.is_blocked && (
            <VideoDivulgar contactId={contact.id} whatsDigits={whatsDigits} videos={videos} />
          )}

          {/* KPIs do contato */}
          <div className="wr-card wr-hover p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3" style={{ color: "var(--color-text-subtle)" }}>Indicadores</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-heading text-2xl font-bold tabular-nums leading-none">{lead.political_score}</div>
                <div className="mt-1 text-xs text-muted-foreground">Pontuação política</div>
              </div>
              <div>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: tempS.bg, color: tempS.color }}>
                  {tempLabel(lead.temperature)}
                </span>
                <div className="mt-1.5 text-xs text-muted-foreground">Temperatura</div>
              </div>
            </div>
            <div className="mt-3 border-t pt-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
              <InfoRow label="Última atividade" value={contact.last_activity_at ? formatarData(contact.last_activity_at) : null} />
              <InfoRow label="Cadastrado em" value={formatarData(lead.created_at)} />
            </div>
          </div>

          {/* Funil visual */}
          <div className="wr-card wr-hover p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3" style={{ color: "var(--color-text-subtle)" }}>Nível no funil</h3>
            <div className="flex items-center justify-between">
              <EtapaPill value={lead.support_level} />
              <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>Etapa {etapaIdx(lead.support_level) + 1} de {ETAPAS_FUNIL.length}</span>
            </div>
            <div className="mt-3">
              <FunilProgresso current={lead.support_level} />
            </div>
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="wr-card wr-hover p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3" style={{ color: "var(--color-text-subtle)" }}>Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

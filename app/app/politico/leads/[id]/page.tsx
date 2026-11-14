/**
 * /app/politico/leads/[id] — Ficha do Lead (War Room 2.0)
 *
 * Detalhe completo de um lead político: dados de contato, nível de relacionamento,
 * engajamento e timeline de transições.
 *
 * Acesso: manager+
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, GitBranch, MessageCircle, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { buscarLinhaDoTempo } from "@/lib/politico/linha-do-tempo";
import { LinhaDoTempo360 } from "@/components/politico/linha-do-tempo-360";
import BotaoDescadastro from "./_descadastrar";
import VideoDivulgar, { type VideoItem } from "./_video-divulgar";
import MarcarFuncao from "./_marcar-funcao";
import { TAG_MULTIPLICADOR } from "@/lib/politico/multiplicadores";
import { TAG_DIVULGADOR } from "@/lib/politico/divulgador";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";
import { nivelParaExibir, niveisVisiveis, rotuloDoNivel } from "@/lib/politico/niveis";

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
  pol_lideranca_id: string | null;
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

// Os 4 níveis de relacionamento do mandato (rótulos: lib/politico/niveis.ts).
// "Voto certo" não existe aqui: registro antigo aparece como Multiplicador —
// por isso todo helper abaixo passa o valor por `nivelParaExibir`.
const ETAPAS_FUNIL = niveisVisiveis(false).map((n, idx) => ({ value: n.value, label: n.label, idx }));

function etapaLabel(value: string): string {
  return rotuloDoNivel(value, false);
}

function etapaIdx(value: string): number {
  const v = nivelParaExibir(value, false);
  return ETAPAS_FUNIL.find((e) => e.value === v)?.idx ?? 0;
}

function etapaCor(value: string): string {
  const mapa: Record<string, string> = {
    novo_cadastro: "var(--wr-funnel-1)",
    simpatizante: "var(--wr-funnel-2)",
    apoiador: "var(--wr-funnel-3)",
    militante: "var(--wr-funnel-4)",
  };
  return mapa[nivelParaExibir(value, false)] ?? "var(--wr-funnel-1)";
}

function etapaPillEstilo(value: string): { bg: string; color: string } {
  const mapa: Record<string, { bg: string; color: string }> = {
    novo_cadastro: { bg: "rgba(129,140,248,0.16)", color: "#A5B4FC" },
    simpatizante: { bg: "rgba(99,102,241,0.20)", color: "#C7D2FE" },
    apoiador: { bg: "rgba(79,70,229,0.24)", color: "#C7D2FE" },
    militante: { bg: "rgba(67,56,202,0.32)", color: "#E0E7FF" },
  };
  return mapa[nivelParaExibir(value, false)] ?? { bg: "rgba(129,140,248,0.16)", color: "#A5B4FC" };
}

function tempLabel(temp: string): string {
  const m: Record<string, string> = { frio: "Frio", morno: "Morno", quente: "Quente" };
  return m[temp] ?? temp;
}

function tempEstilo(temp: string): { bg: string; color: string } {
  const m: Record<string, { bg: string; color: string }> = {
    frio: { bg: "rgba(96,165,250,0.16)", color: "#93C5FD" },
    morno: { bg: "rgba(217,164,75,0.18)", color: "#E4B96E" },
    quente: { bg: "rgba(239,68,68,0.18)", color: "#FCA5A5" },
  };
  return m[temp] ?? { bg: "rgba(255,255,255,0.08)", color: "var(--color-text-muted)" };
}

function formatarData(data: string): string {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Nascimento guardado só como dia/mês usa o ANO SENTINELA 2000 (formulário de
 * perfil, migration 9057): o ano é fictício, não revela idade. Nesse caso mostra
 * só "22 de ago." (parse direto da string, sem fuso). Datas com ano real seguem
 * completas por formatarData.
 */
const MESES_ABREV = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
function formatarNascimento(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (m && m[1] === "2000") {
    return `${Number(m[3])} de ${MESES_ABREV[Number(m[2]) - 1] ?? ""}`.trim();
  }
  return formatarData(data);
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

  // Buscar transições de nível
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

  // Procedência por LIDERANÇA: quem se cadastrou pelo link de captação de uma
  // liderança entra com pol_lideranca_id. A origem real é a liderança (ex.:
  // "Liderança · GIP"), não o genérico "Formulário".
  let origemLideranca: { id: string; nome: string } | null = null;
  if (pl.pol_lideranca_id) {
    const { data: lid } = await db
      .from("pol_liderancas")
      .select("id, nome, apelido")
      .eq("organization_id", organizationId)
      .eq("id", pl.pol_lideranca_id)
      .maybeSingle();
    const l = lid as { id: string; nome: string | null; apelido: string | null } | null;
    if (l) origemLideranca = { id: l.id, nome: (l.apelido || l.nome || "Liderança").trim() };
  }

  // INDICAÇÃO (multiplicador): fecha os dois lados.
  //  - trazidoPor: quem TROUXE este contato (pol_indicacoes.indicado = este).
  //  - trouxe: quem ESTE contato trouxe (pol_indicacoes.indicador = este).
  // É a atribuição por código/enquete (distinta de liderança e obra/emenda).
  let trazidoPor: { nome: string; leadId: string | null } | null = null;
  let trouxe: { leadId: string | null; nome: string }[] = [];
  {
    const [{ data: origem }, { data: indicados }] = await Promise.all([
      db.from("pol_indicacoes").select("indicador_contact_id").eq("organization_id", organizationId).eq("indicado_contact_id", pl.contact_id).maybeSingle(),
      db.from("pol_indicacoes").select("indicado_contact_id").eq("organization_id", organizationId).eq("indicador_contact_id", pl.contact_id).limit(100),
    ]);
    const indicadorId = (origem as { indicador_contact_id: string } | null)?.indicador_contact_id ?? null;
    const indicadoIds = ((indicados ?? []) as { indicado_contact_id: string }[]).map((r) => r.indicado_contact_id);
    const idsParaResolver = [...new Set([indicadorId, ...indicadoIds].filter(Boolean))] as string[];
    if (idsParaResolver.length) {
      const [{ data: nomes }, { data: leadsRel }] = await Promise.all([
        db.from("contacts").select("id, name").in("id", idsParaResolver),
        db.from("pol_leads").select("id, contact_id").eq("organization_id", organizationId).in("contact_id", idsParaResolver),
      ]);
      const nomePorId = new Map(((nomes ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, (c.name ?? "").trim() || "Sem nome"]));
      const leadPorContato = new Map(((leadsRel ?? []) as { id: string; contact_id: string }[]).map((l) => [l.contact_id, l.id]));
      if (indicadorId) trazidoPor = { nome: nomePorId.get(indicadorId) ?? "Multiplicador", leadId: leadPorContato.get(indicadorId) ?? null };
      trouxe = indicadoIds.map((cid) => ({ leadId: leadPorContato.get(cid) ?? null, nome: nomePorId.get(cid) ?? "Sem nome" }));
    }
  }

  // Linha do tempo 360°: tudo que o cidadão viveu com o gabinete (origem,
  // demandas, ofícios, avisos, graduações) num feed único.
  const eventos360 = await buscarLinhaDoTempo(organizationId, pl.contact_id);

  return {
    lead: pl,
    contact: contact as Contact,
    transitions: (transitions ?? []) as FunnelTransition[],
    eventos360,
    mobilizadorNome,
    origemCaptacao,
    origemLideranca,
    trazidoPor,
    trouxe,
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
                background: ativo ? "#D7F36A" : "#F0F0EB",
                color: "#16181D",
              }}
            >
              {etapa.idx + 1}
            </div>
            {etapa.idx < ETAPAS_FUNIL.length - 1 && (
              <div
                className="h-[3px] rounded-full"
                style={{
                  width: 20,
                  background: etapa.idx < idx ? "#D7F36A" : "#F0F0EB",
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
    <div className="gip-glass gip-glass-hover p-5">
      <h3
        className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3"
        style={{ color: "var(--color-text-muted)" }}
      >
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  // Esconde linhas vazias (evita blocos cheios de "—").
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div className="flex justify-between items-start py-1.5 text-sm">
      <span className="font-semibold" style={{ color: "var(--color-text)" }}>{label}</span>
      <span className="text-right font-bold" style={{ color: "var(--color-text)" }}>{value}</span>
    </div>
  );
}

// -- Componente principal ----------------------------------------------------

export default async function FichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirAcessoPolitico("pessoas");
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const { id } = await params;
  const dados = await buscarLead(org.orgId, id);

  if (!dados) notFound();

  const { lead, contact, eventos360, mobilizadorNome, origemCaptacao, origemLideranca, trazidoPor, trouxe } = dados;

  // "Vídeo pra divulgar" é SÓ para quem divulga de fato: o multiplicador — liderança/
  // assessor marcado por função, ou apoiador+ que aceitou o convite (consentimento).
  // Novo cadastro/simpatizante NÃO vê o card. Marcador canônico: a tag `multiplicador`
  // (mesmo critério do placar de Multiplicadores e de quem recebe o disparo do link).
  const ehMultiplicador = (contact.tags ?? []).includes(TAG_MULTIPLICADOR);
  // Função (reusa a mesma máquina do placar): tem `divulgador` → Divulgador;
  // só `multiplicador` → Assessor (equipe marcada por função). Senão, sem selo.
  const funcao: "assessor" | "divulgador" | null = ehMultiplicador
    ? ((contact.tags ?? []).includes(TAG_DIVULGADOR) ? "divulgador" : "assessor")
    : null;

  // Vídeos da biblioteca (posts do IG) para gerar o link pessoal de divulgação.
  // Só busca para multiplicador — não faz sentido para o resto da base.
  let videos: VideoItem[] = [];
  if (ehMultiplicador) {
    const dbVideos = await createClient();
    const { data: videosData } = await dbVideos
      .from("pol_materiais")
      .select("id, titulo")
      .eq("organization_id", org.orgId)
      .eq("tipo", "video")
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(12);
    videos = ((videosData ?? []) as { id: string; titulo: string }[]).map((v) => ({ id: v.id, titulo: v.titulo }));
  }

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
    <div className="gip-ambient-bg mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
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
          className="gip-glass p-4 flex items-start gap-3"
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

      {/* ── Header card (padrão HERO navy) ──────────────────────── */}
      <header
        className="gip-glass war-room wr-claro wr-navy-section p-6 sm:p-7"
        data-theme="light"
        style={{ background: "var(--hero-grad)", border: "1px solid var(--hero-border)" }}
      >
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
                  style={{ background: "var(--color-accent)", color: "#2E3410" }}
                >
                  Líder
                </span>
              )}
              {funcao && (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                  style={
                    funcao === "divulgador"
                      ? { background: "rgba(52,211,153,0.18)", color: "#6EE7B7" }
                      : { background: "rgba(56,189,248,0.18)", color: "#7DD3FC" }
                  }
                >
                  {funcao === "divulgador" ? "Divulgador" : "Assessor"}
                </span>
              )}
              <span className="text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
                Pontuação: {lead.political_score}
              </span>
            </div>
          </div>

          {/* Progresso nos níveis */}
          <div className="hidden sm:block">
            <FunilProgresso current={lead.support_level} />
            <div className="text-[11px] text-center mt-1.5" style={{ color: "var(--color-text-subtle)" }}>
              Nível {etapaIdx(lead.support_level) + 1} de {ETAPAS_FUNIL.length}
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
            <InfoRow label="Nascimento" value={contact.birthdate ? formatarNascimento(contact.birthdate) : null} />
            <InfoRow label="Profissão" value={profissaoContato} />
            <InfoRow
              label="Origem"
              value={
                origemLideranca ? (
                  <Link
                    href={`/app/politico/liderancas/${origemLideranca.id}`}
                    className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
                    style={{ color: "#8AA0E8" }}
                  >
                    <span className="truncate max-w-[220px]">Liderança · {origemLideranca.nome}</span>
                    <ArrowUpRight style={{ width: 13, height: 13 }} className="shrink-0" />
                  </Link>
                ) : (
                  sourceLabel(contact.source)
                )
              }
            />
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
            {trazidoPor && (
              <InfoRow
                label="Trazido por"
                value={
                  trazidoPor.leadId ? (
                    <Link
                      href={`/app/politico/leads/${trazidoPor.leadId}`}
                      className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
                      style={{ color: "#8AA0E8" }}
                    >
                      <span className="truncate max-w-[220px]">🏆 {trazidoPor.nome}</span>
                      <ArrowUpRight style={{ width: 13, height: 13 }} className="shrink-0" />
                    </Link>
                  ) : (
                    <span>🏆 {trazidoPor.nome}</span>
                  )
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

          {(lead.community_role || lead.leader_potential || mobilizadorNome) && (
            <InfoCard titulo="Comunidade & mobilização">
              <InfoRow label="Papel comunitário" value={lead.community_role} />
              <InfoRow label="Potencial multiplicador" value={lead.leader_potential ? "Sim" : null} />
              <InfoRow label="Mobilizador" value={mobilizadorNome} />
            </InfoCard>
          )}

          {temRelacionamento && (
            <InfoCard titulo="Relacionamento">
              <InfoRow label="Quem indicou" value={quemIndicou} />
              <InfoRow label="Observações" value={observacoes} />
            </InfoCard>
          )}

          {trouxe.length > 0 && (
            <InfoCard titulo={`Cadastros que trouxe (${trouxe.length})`}>
              <div className="flex flex-wrap gap-2">
                {trouxe.map((p, i) =>
                  p.leadId ? (
                    <Link
                      key={p.leadId}
                      href={`/app/politico/leads/${p.leadId}`}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-70"
                      style={{ background: "color-mix(in srgb, var(--color-text) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 13%, transparent)", color: "var(--color-text)" }}
                    >
                      {p.nome}
                      <ArrowUpRight className="shrink-0" style={{ width: 13, height: 13, color: "var(--color-text-subtle)" }} />
                    </Link>
                  ) : (
                    <span
                      key={`s-${i}`}
                      className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium"
                      style={{ background: "color-mix(in srgb, var(--color-text) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 13%, transparent)", color: "var(--color-text)" }}
                    >
                      {p.nome}
                    </span>
                  ),
                )}
              </div>
            </InfoCard>
          )}

          <InfoCard titulo="Linha do tempo 360°">
            <LinhaDoTempo360 eventos={eventos360} />
          </InfoCard>
        </div>

        {/* Coluna direita (1/3): ações, KPIs, nível, tags */}
        <div className="space-y-4">
          {/* Ações rápidas */}
          <div className="gip-glass p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3" style={{ color: "var(--color-text-muted)" }}>Ações rápidas</h3>
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
                <GitBranch style={{ width: 16, height: 16 }} /> Ver os níveis
              </Link>
              {!contact.is_blocked && (
                <MarcarFuncao contactId={contact.id} ehMultiplicador={ehMultiplicador} funcao={funcao} />
              )}
              <div className="border-t pt-2.5 mt-0.5" style={{ borderColor: "var(--color-border)" }}>
                <BotaoDescadastro contactId={contact.id} leadId={lead.id} bloqueado={!!contact.is_blocked} />
              </div>
            </div>
          </div>

          {/* Vídeo pra divulgar — link pessoal rastreável (alcance do multiplicador) */}
          {!contact.is_blocked && ehMultiplicador && (
            <VideoDivulgar contactId={contact.id} whatsDigits={whatsDigits} videos={videos} />
          )}

          {/* KPIs do contato */}
          <div className="gip-glass gip-glass-hover p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3" style={{ color: "var(--color-text-muted)" }}>Indicadores</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <div className="font-heading text-2xl font-bold tabular-nums leading-none" style={{ color: "var(--color-text)" }}>{lead.political_score}</div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(lead.political_score, 0), 100)}%`, minWidth: lead.political_score > 0 ? 6 : 0, background: "linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 55%, transparent), var(--color-accent))", boxShadow: "0 0 10px color-mix(in srgb, var(--color-accent) 45%, transparent)" }} />
                </div>
                <div className="mt-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>Pontuação política</div>
              </div>
              <div className="rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: tempS.bg, color: tempS.color }}>
                  {tempLabel(lead.temperature)}
                </span>
                <div className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>Temperatura</div>
              </div>
            </div>
            <div className="mt-3 border-t pt-3 text-sm" style={{ borderColor: "var(--color-border)" }}>
              <InfoRow label="Última atividade" value={contact.last_activity_at ? formatarData(contact.last_activity_at) : null} />
              <InfoRow label="Cadastrado em" value={formatarData(lead.created_at)} />
            </div>
          </div>

          {/* Nível de relacionamento */}
          <div className="gip-glass gip-glass-hover p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3" style={{ color: "var(--color-text-muted)" }}>Nível de relacionamento</h3>
            <div className="flex items-center justify-between">
              <EtapaPill value={lead.support_level} />
              <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>Nível {etapaIdx(lead.support_level) + 1} de {ETAPAS_FUNIL.length}</span>
            </div>
            <div className="mt-3">
              <FunilProgresso current={lead.support_level} />
            </div>
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="gip-glass gip-glass-hover p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[.08em] mb-3" style={{ color: "var(--color-text-muted)" }}>Tags</h3>
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

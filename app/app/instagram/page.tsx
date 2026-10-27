/**
 * /app/instagram — Hub do canal Instagram (War Room 2.0)
 *
 * Ponto de entrada do motor ManyChat próprio do GIP War Room 2.0.
 * Apresenta: status da conexão (OAuth), atalhos para Conectar, Automações,
 * Tokens de Webhook e Etiquetas, e métricas básicas do canal.
 *
 * Design: usa os tokens de tema (var(--color-*)) e as classes wr-card-dark /
 * wr-card-accent — nada de cor fixa, pra respeitar o tema escuro/claro.
 *
 * Acesso: manager+
 */

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface MetricasCanal {
  flowsAtivos: number;
  comentariosHoje: number;
  dmsEnviadasHoje: number;
  tokensAtivos: number;
}

interface SessaoInstagram {
  ig_business_account_id: string;
  display_name: string | null;
  status: string;
  ig_token_expires_at: string | null;
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function buscarMetricas(organizationId: string): Promise<MetricasCanal> {
  const db = await createClient();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = hoje.toISOString();

  const [flows, comentarios, dms, tokens] = await Promise.all([
    db
      .from("ig_automation_flows")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("ativo", true),

    db
      .from("ig_comment_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("received_at", hojeISO),

    db
      .from("ig_comment_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("dm_enviada", true)
      .gte("dm_enviada_at", hojeISO),

    db
      .from("ig_webhook_tokens")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("ativo", true),
  ]);

  return {
    flowsAtivos: flows.count ?? 0,
    comentariosHoje: comentarios.count ?? 0,
    dmsEnviadasHoje: dms.count ?? 0,
    tokensAtivos: tokens.count ?? 0,
  };
}

async function buscarSessao(organizationId: string): Promise<SessaoInstagram | null> {
  const db = await createClient();
  const { data } = await db
    .from("channel_sessions")
    .select("ig_business_account_id, display_name, status, ig_token_expires_at")
    .eq("organization_id", organizationId)
    .eq("provider", "instagram")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as SessaoInstagram | null) ?? null;
}

function diasAteExpirar(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── Ícones (inline, herdam currentColor) ─────────────────────────────────────

function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    instagram: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </>
    ),
    zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
    chart: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>
    ),
    users: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    message: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
    send: (
      <>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </>
    ),
    key: (
      <>
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" />
      </>
    ),
    tag: (
      <>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </>
    ),
    webhook: (
      <>
        <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
        <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
        <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
      </>
    ),
    plug: (
      <>
        <path d="M12 22v-5" />
        <path d="M9 7V2" />
        <path d="M15 7V2" />
        <path d="M6 13V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z" />
      </>
    ),
    check: <polyline points="20 6 9 17 4 12" />,
    arrow: (
      <>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  live,
}: {
  label: string;
  value: number;
  icon: string;
  live?: boolean;
}) {
  const ativo = value > 0;
  return (
    <div className="wr-card-dark flex-1 min-w-[150px] p-4">
      <div className="flex items-center justify-between">
        <span
          className="text-[12px] font-medium uppercase tracking-wide"
          style={{ color: "var(--color-text-subtle)" }}
        >
          {label}
        </span>
        <span style={{ color: ativo ? "var(--color-accent)" : "var(--color-text-subtle)" }}>
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </span>
      </div>
      <div
        className="font-heading text-[30px] font-bold mt-1 tabular-nums leading-none"
        style={{ color: ativo ? "var(--color-accent)" : "var(--color-text)" }}
      >
        {value.toLocaleString("pt-BR")}
      </div>
      {live && ativo && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
              style={{ background: "var(--color-accent)" }}
            />
            <span
              className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: "var(--color-accent)" }}
            />
          </span>
          <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
            ao vivo hoje
          </span>
        </div>
      )}
    </div>
  );
}

function SecaoCard({
  href,
  titulo,
  descricao,
  icon,
  badge,
}: {
  href: string;
  titulo: string;
  descricao: string;
  icon: string;
  badge: string | null;
}) {
  return (
    <Link href={href} className="group wr-card-dark p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center justify-center w-10 h-10 rounded-[12px]"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
            color: "var(--color-accent)",
          }}
        >
          <Icon name={icon} />
        </span>
        {badge && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: "var(--color-accent)", color: "#1B2206" }}
          >
            {badge}
          </span>
        )}
      </div>
      <div>
        <h2
          className="font-heading text-[17px] font-bold"
          style={{ color: "var(--color-text)" }}
        >
          {titulo}
        </h2>
        <p className="text-sm leading-snug mt-1" style={{ color: "var(--color-text-muted)" }}>
          {descricao}
        </p>
      </div>
      <span
        className="inline-flex items-center gap-1 text-sm font-semibold mt-auto transition-transform group-hover:translate-x-0.5"
        style={{ color: "var(--color-accent)" }}
      >
        Acessar <Icon name="arrow" className="w-4 h-4" />
      </span>
    </Link>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default async function InstagramHubPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const [metricas, sessao] = await Promise.all([
    buscarMetricas(org.orgId),
    buscarSessao(org.orgId),
  ]);

  // status segue o vocabulário do WAHA (channel_sessions compartilhada): WORKING = ativo.
  const conectado = sessao !== null && sessao.status === "WORKING";
  const dias = conectado ? diasAteExpirar(sessao!.ig_token_expires_at) : null;
  const contaLabel = sessao?.display_name ?? sessao?.ig_business_account_id ?? null;

  const secoes = [
    {
      href: "/app/instagram/performance",
      titulo: "Minha Performance",
      descricao:
        "Seguidores, posts e engajamento da sua conta — dados oficiais da API do Instagram.",
      icon: "chart",
      badge: conectado ? "ao vivo" : null,
    },
    {
      href: "/app/instagram/captacao",
      titulo: "Captação (Kanban)",
      descricao:
        "Quem interage vira lead qualificado pela sua região e, com o WhatsApp, apoiador ativo.",
      icon: "users",
      badge: null,
    },
    {
      href: "/app/instagram/automacoes",
      titulo: "Automações",
      descricao:
        "Respondem comentários e mandam DMs sozinhas — tudo seu, sem depender de ferramenta de fora.",
      icon: "zap",
      badge:
        metricas.flowsAtivos > 0
          ? `${metricas.flowsAtivos} ativo${metricas.flowsAtivos !== 1 ? "s" : ""}`
          : null,
    },
    {
      href: "/app/instagram/webhooks",
      titulo: "Tokens de Webhook",
      descricao:
        "Gere os tokens de URL que conectam seu Instagram Business ao sistema via Graph API.",
      icon: "webhook",
      badge:
        metricas.tokensAtivos > 0
          ? `${metricas.tokensAtivos} token${metricas.tokensAtivos !== 1 ? "s" : ""}`
          : null,
    },
    {
      href: "/app/instagram/etiquetas",
      titulo: "Etiquetas",
      descricao:
        "Etiquetas que as automações aplicam automaticamente nos contatos ao comentar.",
      icon: "tag",
      badge: null,
    },
  ];

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-5">
      {/* ── Header ───────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span
            className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] shrink-0"
            style={{
              background: "linear-gradient(135deg, #833AB4 0%, #FD1D1D 55%, #FCB045 100%)",
              color: "#FFFFFF",
            }}
          >
            <Icon name="instagram" className="w-6 h-6" />
          </span>
          <div>
            <h1
              className="font-heading text-[32px] font-bold leading-tight"
              style={{ color: "var(--color-text)" }}
            >
              Instagram
            </h1>
            <p className="mt-0.5 text-[15px]" style={{ color: "var(--color-text-muted)" }}>
              Comentários e DMs no automático — o seu motor de captação.
            </p>
          </div>
        </div>

        {/* Pílula de status da conexão */}
        <span
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold self-center"
          style={{
            background: conectado
              ? "color-mix(in srgb, var(--color-accent) 16%, transparent)"
              : "color-mix(in srgb, #F59E0B 16%, transparent)",
            color: conectado ? "var(--color-accent)" : "#F59E0B",
            border: `1px solid ${
              conectado
                ? "color-mix(in srgb, var(--color-accent) 35%, transparent)"
                : "color-mix(in srgb, #F59E0B 35%, transparent)"
            }`,
          }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: conectado ? "var(--color-accent)" : "#F59E0B" }}
          />
          {conectado ? "Conta conectada" : "Não conectado"}
        </span>
      </header>

      {/* ── Hero de conexão ─────────────────────────────────────── */}
      {conectado ? (
        <section className="wr-card-dark p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0"
              style={{ background: "var(--color-accent)", color: "#1B2206" }}
            >
              <Icon name="check" className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>
                {contaLabel}
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                {dias !== null
                  ? `Token válido por mais ${dias} dia${dias !== 1 ? "s" : ""}`
                  : "Conexão ativa"}
              </p>
            </div>
          </div>
          <Link
            href="/app/instagram/conectar"
            className="text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ color: "var(--color-accent)" }}
          >
            Gerenciar conexão →
          </Link>
        </section>
      ) : (
        <section className="wr-card-accent p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <span
              className="inline-flex items-center justify-center w-11 h-11 rounded-[13px] shrink-0"
              style={{
                background: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
                color: "var(--color-accent)",
              }}
            >
              <Icon name="plug" className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-[19px] font-bold" style={{ color: "#F3F4EC" }}>
                Conecte sua conta Instagram Business
              </h2>
              <p className="text-sm mt-1" style={{ color: "#B9BCC6" }}>
                Autorize uma vez para ler comentários, enviar DMs e habilitar o monitor de
                adversários. Leva menos de 1 minuto.
              </p>
            </div>
          </div>
          <Link
            href="/app/instagram/conectar"
            className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-bold whitespace-nowrap transition-transform hover:scale-[1.03] active:scale-[0.98]"
            style={{ background: "var(--color-accent)", color: "#1B2206" }}
          >
            <Icon name="instagram" className="w-[18px] h-[18px]" />
            Conectar agora
          </Link>
        </section>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <section aria-label="Métricas do dia" className="flex flex-wrap gap-3">
        <KpiCard label="Automações ativas" value={metricas.flowsAtivos} icon="zap" />
        <KpiCard label="Comentários hoje" value={metricas.comentariosHoje} icon="message" live />
        <KpiCard label="DMs enviadas hoje" value={metricas.dmsEnviadasHoje} icon="send" live />
        <KpiCard label="Tokens ativos" value={metricas.tokensAtivos} icon="key" />
      </section>

      {/* ── Seções ──────────────────────────────────────────────── */}
      <section aria-label="Módulos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secoes.map((secao) => (
          <SecaoCard key={secao.href} {...secao} />
        ))}
      </section>

      {/* ── Instrução de setup ──────────────────────────────────── */}
      {metricas.tokensAtivos === 0 && (
        <div
          className="wr-card-dark p-5 flex flex-wrap items-start gap-3"
          style={{ borderColor: "color-mix(in srgb, #F59E0B 35%, var(--color-border))" }}
        >
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold shrink-0"
            style={{ background: "#F59E0B", color: "#1B1403" }}
          >
            !
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Para começar a receber comentários
            </p>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Gere um token de webhook em{" "}
              <Link
                href="/app/instagram/webhooks"
                className="font-semibold underline underline-offset-4"
                style={{ color: "var(--color-accent)" }}
              >
                Tokens de Webhook
              </Link>{" "}
              e configure-o no App Meta (objeto Instagram).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * /app/instagram — Hub do canal Instagram (War Room 2.0)
 *
 * Ponto de entrada do motor ManyChat próprio do GIP War Room 2.0.
 * Apresenta atalhos para: Automações, Tokens de Webhook, Etiquetas e
 * métricas básicas do canal (comentários recebidos, DMs enviadas, flows ativos).
 *
 * Acesso: manager+
 */

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

// ── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: { bg: string; color: string };
}) {
  return (
    <div
      className="flex-1 min-w-[120px] rounded-[20px] p-4"
      style={{
        background: accent?.bg ?? "#FFFFFF",
        boxShadow: "var(--wr-card-shadow)",
      }}
    >
      <div className="text-[13px] font-medium" style={{ color: accent?.color ?? "#4A4F59" }}>
        {label}
      </div>
      <div
        className="font-heading text-[28px] font-bold mt-0.5 tabular-nums"
        style={{ color: accent?.color ?? "var(--color-text)" }}
      >
        {value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

function SecaoCard({
  href,
  titulo,
  descricao,
  badge,
}: {
  href: string;
  titulo: string;
  descricao: string;
  badge: string | null;
}) {
  return (
    <Link
      href={href}
      className="group wr-card p-5 flex flex-col gap-3 transition-all hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <h2
          className="font-heading text-[18px] font-bold transition-colors"
          style={{ color: "#16181D" }}
        >
          {titulo}
        </h2>
        {badge && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: "#D7F36A", color: "#2E3410" }}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm leading-snug" style={{ color: "#5B606B" }}>
        {descricao}
      </p>
      <span
        className="text-sm font-semibold mt-auto group-hover:translate-x-0.5 transition-transform"
        style={{ color: "#4352C4" }}
      >
        Acessar →
      </span>
    </Link>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default async function InstagramHubPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const metricas = await buscarMetricas(org.orgId);

  const secoes = [
    {
      href: "/app/instagram/automacoes",
      titulo: "Automações",
      descricao:
        "Crie flows para responder comentários e enviar DMs automaticamente — como o ManyChat, mas seu.",
      badge:
        metricas.flowsAtivos > 0
          ? `${metricas.flowsAtivos} ativo${metricas.flowsAtivos !== 1 ? "s" : ""}`
          : null,
    },
    {
      href: "/app/instagram/webhooks",
      titulo: "Tokens de Webhook",
      descricao:
        "Gere e gerencie os tokens de URL que conectam seu Instagram Business ao sistema via Graph API.",
      badge:
        metricas.tokensAtivos > 0
          ? `${metricas.tokensAtivos} token${metricas.tokensAtivos !== 1 ? "s" : ""}`
          : null,
    },
    {
      href: "/app/instagram/etiquetas",
      titulo: "Etiquetas",
      descricao:
        "Gerencie as etiquetas que as automações aplicam automaticamente nos contatos ao comentar.",
      badge: null,
    },
  ];

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header card ─────────────────────────────────────────── */}
      <header className="wr-card p-6 sm:p-7">
        <h1 className="font-heading text-[36px] font-bold leading-tight">Instagram</h1>
        <p className="mt-1.5 text-base" style={{ color: "#4A4F59" }}>
          Motor ManyChat próprio — responda comentários e envie DMs automaticamente.
        </p>
      </header>

      {/* ── KPI cards ───────────────────────────────────────────── */}
      <section aria-label="Métricas do dia" className="flex flex-wrap gap-3">
        <KpiCard label="Flows ativos" value={metricas.flowsAtivos} />
        <KpiCard
          label="Comentários hoje"
          value={metricas.comentariosHoje}
          accent={metricas.comentariosHoje > 0 ? { bg: "#E2F5EC", color: "#17784F" } : undefined}
        />
        <KpiCard
          label="DMs enviadas hoje"
          value={metricas.dmsEnviadasHoje}
          accent={metricas.dmsEnviadasHoje > 0 ? { bg: "#E4E7F8", color: "#2F3DA8" } : undefined}
        />
        <KpiCard label="Tokens ativos" value={metricas.tokensAtivos} />
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
          className="wr-card p-5 flex flex-wrap items-start gap-3"
          style={{ background: "#FCF1DC" }}
        >
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold shrink-0"
            style={{ background: "#8A5A10", color: "#FFFFFF" }}
          >
            !
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#8A5A10" }}>
              Para começar
            </p>
            <p className="text-sm mt-0.5" style={{ color: "#6B4A10" }}>
              Gere um token de webhook em{" "}
              <Link
                href="/app/instagram/webhooks"
                className="font-semibold underline underline-offset-4"
                style={{ color: "#8A5A10" }}
              >
                Tokens de Webhook
              </Link>{" "}
              e configure-o no seu App Meta (Instagram Business).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

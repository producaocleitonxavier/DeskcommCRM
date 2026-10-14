/**
 * /app/politico — Tela "Hoje" do War Room 2.0
 *
 * Design: Main.dc.html do canvas War Room 2.0.
 * Seções: Greeting, Prioridades, KPIs, Funil da Base, Ativação Semanal.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

interface MetricasHoje {
  totalPessoas: number;
  ativadasSemana: number;
  apoiadoresOuMais: number;
  demandasGabinete: number;
  demandasUrgentes: number;
  alertasAtivos: number;
  funilStages: { label: string; count: number; pct: number; cor: string }[];
}

// -- Data fetching -----------------------------------------------------------

async function buscarMetricas(organizationId: string): Promise<MetricasHoje> {
  const db = await createClient();
  const agora = new Date();
  const inicioSemana = new Date(agora);
  inicioSemana.setDate(agora.getDate() - agora.getDay());
  inicioSemana.setHours(0, 0, 0, 0);

  const sextaFeira = new Date(agora);
  sextaFeira.setDate(agora.getDate() + (5 - agora.getDay()));
  sextaFeira.setHours(23, 59, 59, 999);

  const [
    totalPessoas,
    ativadasSemana,
    apoiadoresOuMais,
    demandasGabinete,
    demandasUrgentes,
    alertasAtivos,
    novoContato,
    simpatizante,
    apoiador,
    multiplicador,
    votoCerto,
  ] = await Promise.all([
    db
      .from("pol_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    db
      .from("pol_funnel_transitions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", inicioSemana.toISOString()),
    db
      .from("pol_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("support_level", ["apoiador", "multiplicador", "voto_certo"]),
    db
      .from("pol_demands")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "concluida"),
    db
      .from("pol_demands")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .neq("status", "concluida")
      .lte("deadline", sextaFeira.toISOString()),
    db
      .from("pol_alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    // Funil stages
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "novo_contato"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "simpatizante"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "apoiador"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "multiplicador"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "voto_certo"),
  ]);

  const total = totalPessoas.count ?? 0;
  const stages = [
    { label: "Novo contato", count: novoContato.count ?? 0, cor: "var(--wr-funnel-1)" },
    { label: "Simpatizante", count: simpatizante.count ?? 0, cor: "var(--wr-funnel-2)" },
    { label: "Apoiador", count: apoiador.count ?? 0, cor: "var(--wr-funnel-3)" },
    { label: "Multiplicador", count: multiplicador.count ?? 0, cor: "var(--wr-funnel-4)" },
    { label: "Voto certo", count: votoCerto.count ?? 0, cor: "var(--wr-funnel-5)" },
  ].map((s) => ({ ...s, pct: total > 0 ? Math.max((s.count / total) * 100, 1.2) : 0 }));

  return {
    totalPessoas: total,
    ativadasSemana: ativadasSemana.count ?? 0,
    apoiadoresOuMais: apoiadoresOuMais.count ?? 0,
    demandasGabinete: demandasGabinete.count ?? 0,
    demandasUrgentes: demandasUrgentes.count ?? 0,
    alertasAtivos: alertasAtivos.count ?? 0,
    funilStages: stages,
  };
}

// -- Helpers -----------------------------------------------------------------

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function dataFormatada(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function primeiroNome(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome.split(" ")[0] ?? nome;
}

// -- Componente --------------------------------------------------------------

export default async function HojePage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const m = await buscarMetricas(org.orgId);
  const nome = primeiroNome(user.full_name);

  return (
    <div className="mx-auto max-w-[1140px] space-y-5">
      {/* ── Greeting card ─────────────────────────────────────── */}
      <header className="wr-card flex flex-wrap items-center justify-between gap-5 p-7">
        <div>
          <p className="text-sm text-[--color-text-secondary]">{dataFormatada()}</p>
          <h1 className="font-heading mt-1 text-3xl font-bold leading-tight lg:text-4xl">
            {saudacao()}, {nome}
          </h1>
          <p className="mt-2 text-base text-[--color-text-secondary]">
            {m.alertasAtivos > 0
              ? `${m.alertasAtivos} alerta${m.alertasAtivos !== 1 ? "s" : ""} pede${m.alertasAtivos !== 1 ? "m" : ""} sua atenção hoje.`
              : "Tudo tranquilo por aqui. Hora de avançar."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/app/politico/alertas" className="wr-btn">
            Alertas
          </Link>
          <Link href="/app/politico/leads" className="wr-btn-dark">
            + Novo cadastro
          </Link>
        </div>
      </header>

      {/* ── Prioridades de hoje ────────────────────────────────── */}
      <section className="wr-card p-6" aria-labelledby="prio">
        <div className="mb-4 flex items-center justify-between px-1">
          <h2 id="prio" className="font-heading text-xl font-bold lg:text-[22px]">
            Prioridades de hoje
          </h2>
          <span className="text-[13px] text-[--color-text-tertiary]">Ordenadas por impacto</span>
        </div>
        <div className="flex flex-col gap-2.5">
          {m.alertasAtivos > 0 && (
            <PrioridadeItem
              tipo="risk"
              label="Urgente"
              titulo={`${m.alertasAtivos} alerta${m.alertasAtivos !== 1 ? "s" : ""} ativo${m.alertasAtivos !== 1 ? "s" : ""}`}
              descricao="Verifique os alertas de sentimento, adversários e fake news."
              acao={{ href: "/app/politico/alertas", label: "Ver alertas" }}
              destaque
            />
          )}
          {m.demandasUrgentes > 0 && (
            <PrioridadeItem
              tipo="warn"
              label="Atenção"
              titulo={`${m.demandasUrgentes} demanda${m.demandasUrgentes !== 1 ? "s" : ""} vence${m.demandasUrgentes !== 1 ? "m" : ""} até sexta`}
              descricao="Encaminhamentos pendentes no gabinete."
              acao={{ href: "/app/politico/demandas", label: "Ver demandas" }}
            />
          )}
          {m.ativadasSemana > 0 && (
            <PrioridadeItem
              tipo="ok"
              label="Oportunidade"
              titulo={`${m.ativadasSemana.toLocaleString("pt-BR")} pessoa${m.ativadasSemana !== 1 ? "s" : ""} ativada${m.ativadasSemana !== 1 ? "s" : ""} esta semana`}
              descricao="Transições no funil eleitoral. Continue a mobilização."
              acao={{ href: "/app/politico/funil", label: "Ver funil" }}
            />
          )}
          {m.totalPessoas === 0 && (
            <PrioridadeItem
              tipo="warn"
              label="Início"
              titulo="Cadastre seus primeiros contatos"
              descricao="A base está vazia. Comece importando leads ou cadastrando manualmente."
              acao={{ href: "/app/politico/leads", label: "+ Cadastrar" }}
              destaque
            />
          )}
        </div>
      </section>

      {/* ── KPIs ──────────────────────────────────────────────── */}
      <section
        aria-label="Números principais"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <KpiCard label="Pessoas na base" valor={m.totalPessoas.toLocaleString("pt-BR")} rodape={`${m.funilStages.length} estágios no funil`} />
        <KpiCard label="Ativadas esta semana" valor={m.ativadasSemana.toLocaleString("pt-BR")} destaque />
        <KpiCard label="Apoiadores ou mais" valor={m.apoiadoresOuMais.toLocaleString("pt-BR")} rodape={m.totalPessoas > 0 ? `${Math.round((m.apoiadoresOuMais / m.totalPessoas) * 100)}% da base` : undefined} />
        <KpiCard label="Demandas do gabinete" valor={String(m.demandasGabinete)} badge={m.demandasUrgentes > 0 ? `${m.demandasUrgentes} vence${m.demandasUrgentes !== 1 ? "m" : ""} até sexta` : undefined} />
      </section>

      {/* ── Funil + Ativação ──────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-5">
        {/* Funil da base */}
        <section className="wr-card min-w-0 flex-[3_1_520px] p-6" aria-labelledby="fun">
          <h2 id="fun" className="font-heading text-xl font-bold lg:text-[22px]">Funil da base</h2>
          <p className="mb-4 mt-1 text-[13px] text-[--color-text-tertiary]">O mesmo funil em todo o sistema</p>
          <div className="flex flex-col gap-3.5">
            {m.funilStages.map((stage) => (
              <div key={stage.label}>
                <div className="flex justify-between text-sm">
                  <span>{stage.label}</span>
                  <span className="font-heading font-bold tabular-nums">{stage.count.toLocaleString("pt-BR")}</span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full" style={{ background: "var(--color-surface-elevated)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${stage.pct}%`, background: stage.cor }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Ativação semanal (placeholder visual) */}
        <section className="wr-card min-w-0 flex-[2_1_320px] p-6" aria-labelledby="ativ">
          <h2 id="ativ" className="font-heading text-xl font-bold lg:text-[22px]">Ativação semanal</h2>
          <p className="mb-4 mt-1 text-[13px] text-[--color-text-tertiary]">Transições no funil nas últimas semanas</p>
          <div className="flex items-end gap-2" style={{ height: 120 }} role="img" aria-label={`${m.ativadasSemana} ativações esta semana`}>
            {/* Placeholder — valores reais virão de pol_funnel_transitions agrupados por semana */}
            {[44, 38, 52, 60, 55, 71, 84, 100].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-lg transition-all"
                style={{
                  height: `${h}%`,
                  background: i === 7 ? "var(--wr-btn-dark-bg)" : "var(--color-surface-elevated)",
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-[--color-text-tertiary]">
            <span>8 sem. atrás</span>
            <span className="font-semibold">Esta semana · {m.ativadasSemana.toLocaleString("pt-BR")}</span>
          </div>
        </section>
      </div>
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function KpiCard({
  label,
  valor,
  rodape,
  destaque,
  badge,
}: {
  label: string;
  valor: string;
  rodape?: string;
  destaque?: boolean;
  badge?: string;
}) {
  return (
    <div
      className="wr-card p-5"
      style={destaque ? { background: "var(--color-accent)" } : undefined}
    >
      <div className="text-sm" style={destaque ? { color: "#2E3410" } : { color: "var(--color-text-tertiary)" }}>
        {label}
      </div>
      <div
        className="font-heading mt-1 text-4xl font-bold tabular-nums"
        style={destaque ? { color: "#16181D" } : undefined}
      >
        {valor}
      </div>
      {rodape && (
        <div className="mt-1 text-[13px]" style={destaque ? { color: "#2E3410", fontWeight: 600 } : { color: "var(--color-text-tertiary)" }}>
          {rodape}
        </div>
      )}
      {badge && (
        <div className="mt-1">
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}>
            {badge}
          </span>
        </div>
      )}
    </div>
  );
}

function PrioridadeItem({
  tipo,
  label,
  titulo,
  descricao,
  acao,
  destaque,
}: {
  tipo: "risk" | "warn" | "ok";
  label: string;
  titulo: string;
  descricao: string;
  acao: { href: string; label: string };
  destaque?: boolean;
}) {
  const cores = {
    risk: { bg: "var(--color-error-soft)", fg: "var(--color-error)" },
    warn: { bg: "var(--color-warning-soft)", fg: "var(--color-warning)" },
    ok: { bg: "var(--color-success-soft)", fg: "var(--color-success)" },
  };
  const c = cores[tipo];

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-[18px] p-4 lg:p-5"
      style={{ background: destaque ? "#F2FAD0" : "var(--color-surface-elevated)" }}
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
        style={{ background: c.bg, color: c.fg }}
      >
        {label}
      </span>
      <div className="min-w-0 flex-[1_1_260px]">
        <div className="text-base font-semibold">{titulo}</div>
        <div className="mt-0.5 text-sm text-[--color-text-secondary]">{descricao}</div>
      </div>
      <Link href={acao.href} className={destaque ? "wr-btn-dark" : "wr-btn"}>
        {acao.label}
      </Link>
    </div>
  );
}

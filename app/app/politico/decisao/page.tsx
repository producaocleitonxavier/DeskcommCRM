/**
 * /app/politico/decisao — Decision Engine
 *
 * Sinais estratégicos e ações recomendadas por IA.
 * Consolida dados de pol_decision_signals, pol_alerts e pol_crisis_predictions.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

// -- Tipos -------------------------------------------------------------------

interface Sinal {
  id: string;
  signal_type: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  recommended_action: string | null;
  source_data: Record<string, unknown> | null;
  created_at: string;
}

interface AlertaResumo {
  id: string;
  title: string;
  alert_type: string | null;
  severity: string;
  status: string;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  sentiment_shift: "Mudança de sentimento",
  engagement_spike: "Pico de engajamento",
  opponent_move: "Movimento adversário",
  territory_change: "Mudança territorial",
  crisis_signal: "Sinal de crise",
  opportunity: "Oportunidade",
};

// -- Data fetching -----------------------------------------------------------

async function buscarSinais(organizationId: string): Promise<Sinal[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_decision_signals")
    .select("id, signal_type, title, description, severity, status, recommended_action, source_data, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(30);

  return (data ?? []) as Sinal[];
}

async function buscarAlertasAtivos(organizationId: string): Promise<AlertaResumo[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_alerts")
    .select("id, title, alert_type, severity, status, created_at")
    .eq("organization_id", organizationId)
    .in("status", ["open", "acknowledged", "investigating"])
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []) as AlertaResumo[];
}

// -- Componente --------------------------------------------------------------

export default async function DecisaoPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const [sinais, alertas] = await Promise.all([
    buscarSinais(org.orgId),
    buscarAlertasAtivos(org.orgId),
  ]);

  const sinaisPendentes = sinais.filter((s) => s.status === "pending");
  const sinaisCriticos = sinais.filter((s) => ["high", "critical"].includes(s.severity));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Decision Engine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sinais estratégicos e ações recomendadas por IA.
          </p>
        </div>
        <Link
          href="/app/politico"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← War Room
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Sinais totais" valor={String(sinais.length)} cor="text-blue-500" />
        <KpiCard label="Pendentes" valor={String(sinaisPendentes.length)} cor="text-yellow-500" />
        <KpiCard label="Críticos" valor={String(sinaisCriticos.length)} cor="text-red-500" />
        <KpiCard label="Alertas ativos" valor={String(alertas.length)} cor="text-orange-500" />
      </div>

      {/* Alertas ativos */}
      {alertas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            🔔 Alertas ativos
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {alertas.map((a) => {
              const sevCor = SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.medium;
              return (
                <Link
                  key={a.id}
                  href="/app/politico/alertas"
                  className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevCor}`}>
                        {a.severity}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.alert_type?.replace(/_/g, " ")} · {new Date(a.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Sinais estratégicos */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          ⚡ Sinais estratégicos ({sinais.length})
        </h2>
        {sinais.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <strong>Decision Engine:</strong> os sinais serão gerados automaticamente quando a
            inteligência social, monitoramento de adversários e análise territorial estiverem ativos.
          </div>
        ) : (
          <div className="space-y-2">
            {sinais.map((s) => (
              <SinalCard key={s.id} sinal={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function SinalCard({ sinal }: { sinal: Sinal }) {
  const sevCor = SEVERITY_COLORS[sinal.severity] ?? SEVERITY_COLORS.medium;
  const isPending = sinal.status === "pending";

  return (
    <div className={`flex items-start gap-3 rounded-lg border bg-card p-4 ${isPending ? "border-l-4 border-l-yellow-500" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm">{sinal.title}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevCor}`}>
            {sinal.severity}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {SIGNAL_TYPE_LABELS[sinal.signal_type] ?? sinal.signal_type.replace(/_/g, " ")}
          </span>
          {isPending && (
            <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              Pendente
            </span>
          )}
        </div>
        {sinal.description && (
          <p className="mt-1 text-xs text-muted-foreground">{sinal.description}</p>
        )}
        {sinal.recommended_action && (
          <div className="mt-2 rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200">
            <strong>Ação recomendada:</strong> {sinal.recommended_action}
          </div>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {new Date(sinal.created_at).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

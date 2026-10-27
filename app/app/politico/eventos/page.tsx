/**
 * /app/politico/eventos — Eventos (War Room 2.0)
 *
 * Lista de eventos da campanha com tipo, status e métricas de público.
 * Tabela: pol_events. Visual: padrão War Room (CommandHero + wr-card + tokens).
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { CommandHero } from "@/components/politico/command-hero";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

interface Evento {
  id: string;
  title: string;
  type: string | null;
  status: string;
  event_date: string | null;
  city: string | null;
  estimated_audience: number | null;
  actual_attendance: number | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  postponed: "Adiado",
};

const STATUS_COR: Record<string, { bg: string; fg: string }> = {
  scheduled: { bg: "rgba(59,130,246,0.16)", fg: "#93C5FD" },
  confirmed: { bg: "rgba(215,243,106,0.16)", fg: "#D7F36A" },
  in_progress: { bg: "rgba(245,158,11,0.16)", fg: "#FBBF24" },
  completed: { bg: "rgba(74,222,128,0.16)", fg: "#4ADE80" },
  cancelled: { bg: "rgba(239,68,68,0.16)", fg: "#F87171" },
  postponed: { bg: "rgba(148,163,184,0.16)", fg: "#CBD5E1" },
};

const TYPE_LABELS: Record<string, string> = {
  reuniao: "Reunião",
  comicio: "Comício",
  caminhada: "Caminhada",
  carreata: "Carreata",
  debate: "Debate",
  audiencia: "Audiência",
  assembleia: "Assembleia",
  workshop: "Oficina",
  live: "Transmissão ao vivo",
  entrevista: "Entrevista",
  visita: "Visita",
  outro: "Outro",
};

// -- Data fetching -----------------------------------------------------------

async function buscarEventos(
  organizationId: string,
  filtroStatus?: string,
  filtroType?: string,
): Promise<Evento[]> {
  const db = await createClient();

  let query = db
    .from("pol_events")
    .select("id, title, type, status, event_date, city, estimated_audience, actual_attendance, created_at")
    .eq("organization_id", organizationId)
    .order("event_date", { ascending: false, nullsFirst: false })
    .limit(100);

  if (filtroStatus) query = query.eq("status", filtroStatus);
  if (filtroType) query = query.eq("type", filtroType);

  const { data, error } = await query;
  if (error) {
    console.error("Erro ao buscar eventos:", error.message);
    return [];
  }
  return (data ?? []) as Evento[];
}

// -- Componente --------------------------------------------------------------

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const filtroStatus = params.status ?? "";
  const filtroType = params.type ?? "";

  const eventos = await buscarEventos(org.orgId, filtroStatus || undefined, filtroType || undefined);

  return (
    <div className="mx-auto max-w-5xl space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Gabinete · Campanha"
        titulo="Eventos"
        subtitulo="Os eventos da campanha com público estimado e presença real."
        acoes={[{ href: "/app/politico", label: "← Voltar" }]}
      />

      {/* Ação principal (em breve) */}
      <div className="flex justify-end">
        <span
          className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)", border: "1px dashed var(--color-border)", cursor: "not-allowed" }}
          title="Em breve"
        >
          + Novo evento (em breve)
        </span>
      </div>

      {/* Filtros */}
      <div className="wr-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Situação</span>
          <FilterLink href={buildHref("", filtroType)} label="Todos" active={!filtroStatus} />
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <FilterLink key={value} href={buildHref(value, filtroType)} label={label} active={filtroStatus === value} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Tipo</span>
          <FilterLink href={buildHref(filtroStatus, "")} label="Todos" active={!filtroType} />
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <FilterLink key={value} href={buildHref(filtroStatus, value)} label={label} active={filtroType === value} />
          ))}
        </div>
      </div>

      {/* Cards */}
      {eventos.length === 0 ? (
        <div className="wr-card py-12 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          Nenhum evento encontrado.
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {eventos.map((e) => (
            <div key={e.id} className="wr-card flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-heading font-bold leading-snug" style={{ color: "var(--color-text)" }}>{e.title}</h2>
                <StatusBadge status={e.status} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {e.type && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(215,243,106,0.14)", color: "#B7C96A" }}>
                    {TYPE_LABELS[e.type] ?? e.type}
                  </span>
                )}
                {e.city && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>📍 {e.city}</span>}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                {e.event_date && (
                  <span>
                    🗓 {new Date(e.event_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
                {e.estimated_audience != null && <span>Estimado: <strong style={{ color: "var(--color-text)" }}>{e.estimated_audience.toLocaleString("pt-BR")}</strong></span>}
                {e.actual_attendance != null && <span>Presença: <strong style={{ color: "#D7F36A" }}>{e.actual_attendance.toLocaleString("pt-BR")}</strong></span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Helpers -----------------------------------------------------------------

function buildHref(status: string, type: string): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  const qs = params.toString();
  return `/app/politico/eventos${qs ? `?${qs}` : ""}`;
}

// -- Sub-componentes ---------------------------------------------------------

function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
      style={
        active
          ? { background: "#D7F36A", color: "#1B2206" }
          : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }
      }
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const cor = STATUS_COR[status] ?? { bg: "var(--color-surface-elevated)", fg: "var(--color-text-muted)" };
  return (
    <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: cor.bg, color: cor.fg }}>
      {label}
    </span>
  );
}

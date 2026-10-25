"use client";
/**
 * Disparos — a lista (War Room 2.0, redesign premium).
 *
 * Centro de Comando de comunicação: CommandHero + KPIs do que está no ar +
 * cards táticos por disparo (estágio, público, material, quando). A lista não
 * tenta ser o painel; quem quer o detalhe abre o disparo.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { CommandHero } from "@/components/politico/command-hero";
import { KpiCard } from "@/components/politico/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampanhas } from "@/hooks/campanhas/useCampanhas";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Megaphone, Send, CheckCircle2, Users, BookOpen, ArrowUpRight } from "lucide-react";
import { STATUS_DA_CAMPANHA } from "@/lib/campanhas/tipos";

interface CampanhaLinha {
  id: string;
  name: string;
  status: string;
  snapshot_eligible: number;
  snapshot_excluded: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  material_id?: string | null;
}

export function ListaDeCampanhas() {
  const t = useT();
  const idioma = useTagDeIdioma();
  const [status, setStatus] = useState<string>("");
  const filtros = useMemo(() => ({ status: status || undefined, limit: 30 }), [status]);
  const q = useCampanhas(filtros);
  const campanhas = useMemo(
    () => (q.data?.pages.flatMap((p) => p.data) ?? []) as unknown as CampanhaLinha[],
    [q.data],
  );

  const kpis = useMemo(() => {
    const enviando = campanhas.filter((c) => c.status === "running").length;
    const concluidos = campanhas.filter((c) => c.status === "completed").length;
    const naBase = campanhas.reduce((s, c) => s + (c.snapshot_eligible || 0), 0);
    return { total: campanhas.length, enviando, concluidos, naBase };
  }, [campanhas]);

  return (
    <div className="mx-auto max-w-[1140px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Operação · Comunicação"
        titulo="Disparos"
        subtitulo="Fale com a base que você escolhe — por origem e estágio no funil, no ritmo que não queima o número. Quem responde entra no atendimento e recebe o material sozinho."
        acoes={[
          { href: "/app/campaigns/new", label: "Novo disparo", primary: true },
          { href: "/app/campaigns/settings", label: "Ajustes" },
        ]}
      />

      {/* KPIs */}
      {campanhas.length > 0 && (
        <div className="wr-anim-in grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("Disparos")} valor={kpis.total} icone={Megaphone} />
          <KpiCard label={t("Enviando agora")} valor={kpis.enviando} icone={Send} cor="#4ADE80" />
          <KpiCard label={t("Concluídos")} valor={kpis.concluidos} icone={CheckCircle2} />
          <KpiCard label={t("Pessoas na lista")} valor={kpis.naBase} icone={Users} />
        </div>
      )}

      {/* Filtro de situação */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
          {t("Situação")}
        </span>
        <button
          type="button"
          onClick={() => setStatus("")}
          className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
          style={
            status === ""
              ? { background: "var(--color-accent)", color: "#14181F", borderColor: "transparent" }
              : { borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
          }
        >
          {t("Todas")}
        </button>
        {STATUS_DA_CAMPANHA.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
            style={
              status === s
                ? { background: "var(--color-accent)", color: "#14181F", borderColor: "transparent" }
                : { borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
            }
          >
            {t(rotulo(s))}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="wr-card p-6 text-center">
          <p className="text-sm" style={{ color: "#F87171" }}>{t("Erro ao carregar os disparos.")}</p>
          <button className="wr-btn mt-3" onClick={() => q.refetch()}>{t("Tentar novamente")}</button>
        </div>
      ) : campanhas.length === 0 ? (
        <div className="wr-card flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.12)" }}>
            <Megaphone className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
          </span>
          <h2 className="font-heading text-lg font-bold" style={{ color: "var(--color-text)" }}>
            {t("Nenhum disparo ainda")}
          </h2>
          <p className="max-w-md text-sm" style={{ color: "var(--color-text-subtle)" }}>
            {t("Um disparo fala com uma lista que você escolhe — por origem e estágio —, no ritmo do número, nunca em rajada. Quem responde recebe o material sozinho.")}
          </p>
          <Link href="/app/campaigns/new" className="wr-btn-dark mt-1 px-6">{t("Criar primeiro disparo")}</Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {campanhas.map((c, i) => {
              const pill = statusPill(c.status);
              return (
                <Link
                  key={c.id}
                  href={`/app/campaigns/${c.id}`}
                  className="wr-card wr-hover wr-lift wr-anim-in group flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                  style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                        style={{ background: pill.bg, color: pill.color }}
                      >
                        {c.status === "running" && <span className="wr-live-dot" aria-hidden />}
                        {t(pill.label)}
                      </span>
                      {c.material_id && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: "rgba(215,243,106,0.12)", color: "#8AA62E" }}
                        >
                          <BookOpen className="h-3 w-3" /> {t("com material")}
                        </span>
                      )}
                    </div>
                    <p className="truncate font-heading text-[17px] font-bold" style={{ color: "var(--color-text)" }}>
                      {c.name}
                    </p>
                    <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
                      {c.snapshot_eligible > 0
                        ? `${c.snapshot_eligible.toLocaleString("pt-BR")} ${t("na lista")}`
                        : t("lista ainda não preparada")}
                      {c.snapshot_excluded > 0 ? ` · ${c.snapshot_excluded} ${t("fora")}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>
                      {quando(c, t, idioma)}
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 opacity-40 transition-opacity group-hover:opacity-100"
                      style={{ color: "var(--color-accent)" }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
          {q.hasNextPage && (
            <div className="flex justify-center">
              <button
                className="wr-btn"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
              >
                {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function rotulo(status: string): string {
  const mapa: Record<string, string> = {
    draft: "Rascunho",
    preparing: "Montando a lista",
    ready: "Pronta para iniciar",
    scheduled: "Agendada",
    running: "Enviando",
    paused: "Pausada",
    completed: "Concluída",
    cancelled: "Cancelada",
    failed: "Falhou",
  };
  return mapa[status] ?? status;
}

function statusPill(status: string): { label: string; bg: string; color: string } {
  const mapa: Record<string, { label: string; bg: string; color: string }> = {
    draft: { label: "Rascunho", bg: "#EEF0FB", color: "#3B4280" },
    preparing: { label: "Montando", bg: "#DDE1F7", color: "#2F3DA8" },
    ready: { label: "Pronta", bg: "#DDE1F7", color: "#2F3DA8" },
    scheduled: { label: "Agendada", bg: "#FCF1DC", color: "#8A5A10" },
    running: { label: "Enviando", bg: "rgba(34,197,94,0.15)", color: "#15803D" },
    paused: { label: "Pausada", bg: "#FCF1DC", color: "#8A5A10" },
    completed: { label: "Concluída", bg: "#E4E7F8", color: "#2F3DA8" },
    cancelled: { label: "Cancelada", bg: "#F0F0EB", color: "#6B6B5E" },
    failed: { label: "Falhou", bg: "#FBE4E2", color: "#A3302A" },
  };
  return mapa[status] ?? { label: status, bg: "#F0F0EB", color: "#6B6B5E" };
}

/** A data que importa depende do estado — "criada em" numa que terminou é ruído. */
function quando(
  c: { status: string; scheduled_at: string | null; started_at: string | null; completed_at: string | null; created_at: string },
  t: (s: string) => string,
  idioma: string,
): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString(idioma, { dateStyle: "short", timeStyle: "short" });
  if (c.status === "scheduled" && c.scheduled_at) return `${t("começa")} ${fmt(c.scheduled_at)}`;
  if (c.completed_at) return `${t("terminou")} ${fmt(c.completed_at)}`;
  if (c.started_at) return `${t("começou")} ${fmt(c.started_at)}`;
  return `${t("criada")} ${fmt(c.created_at)}`;
}

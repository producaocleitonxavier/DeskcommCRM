"use client";

/**
 * Agenda do mandato (Gabinete): faixa de semana navegável + lista do dia
 * selecionado, com KPIs. Compromissos tipados e com status, no dark tático.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { SectionHeader } from "@/components/politico/section-header";
import { Calendar, CalendarCheck, Clock, Hourglass } from "lucide-react";

export interface Compromisso {
  id: string;
  titulo: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  dia_inteiro: boolean;
  status: string;
  local: string | null;
  municipio: string | null;
}

export interface AgendaClientProps {
  compromissos: Compromisso[];
}

const TIPO_CFG: Record<string, { label: string; bg: string; fg: string }> = {
  reuniao: { label: "Reunião", bg: "rgba(99,121,221,0.16)", fg: "#9AA5EA" },
  visita: { label: "Visita", bg: "rgba(34,197,94,0.16)", fg: "#22C55E" },
  audiencia: { label: "Audiência", bg: "rgba(139,92,246,0.16)", fg: "#A78BFA" },
  evento: { label: "Evento", bg: "rgba(236,72,153,0.16)", fg: "#F472B6" },
  ligacao: { label: "Ligação", bg: "rgba(14,165,233,0.16)", fg: "#38BDF8" },
  compromisso: { label: "Compromisso", bg: "rgba(255,255,255,0.08)", fg: "var(--color-text-muted)" },
  outro: { label: "Outro", bg: "rgba(255,255,255,0.08)", fg: "var(--color-text-muted)" },
};
const STATUS_CFG: Record<string, { label: string; bg: string; fg: string }> = {
  agendado: { label: "Agendado", bg: "rgba(245,158,11,0.16)", fg: "#F59E0B" },
  confirmado: { label: "Confirmado", bg: "rgba(34,197,94,0.16)", fg: "#22C55E" },
  concluido: { label: "Concluído", bg: "rgba(156,163,175,0.16)", fg: "#9CA3AF" },
  cancelado: { label: "Cancelado", bg: "rgba(239,68,68,0.16)", fg: "#EF4444" },
};
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inicioSemana(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // domingo
  return d;
}

export default function AgendaClient({ compromissos }: AgendaClientProps) {
  const hojeKey = chaveDia(new Date());
  const [offset, setOffset] = useState(0);
  const [selecionado, setSelecionado] = useState(hojeKey);

  // Agrupa por dia (chave local).
  const porDia = useMemo(() => {
    const m = new Map<string, Compromisso[]>();
    for (const c of compromissos) {
      const k = chaveDia(new Date(c.data_inicio));
      (m.get(k) ?? m.set(k, []).get(k)!).push(c);
    }
    return m;
  }, [compromissos]);

  const semana = useMemo(() => {
    const base = inicioSemana(new Date());
    base.setDate(base.getDate() + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [offset]);

  const doDia = (porDia.get(selecionado) ?? []).slice().sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  const totalHoje = (porDia.get(hojeKey) ?? []).length;
  const totalSemana = semana.reduce((s, d) => s + (porDia.get(chaveDia(d)) ?? []).length, 0);
  const aConfirmar = compromissos.filter((c) => c.status === "agendado").length;
  const confirmados = compromissos.filter((c) => c.status === "confirmado").length;

  const rotuloSemana = `${semana[0]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${semana[6]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <SectionHeader
        title="Agenda"
        subtitle="Compromissos do mandato — reuniões, visitas, audiências e eventos."
        action={{ label: "+ Novo compromisso", href: "/app/politico/agenda/novo" }}
        actionTone="accent"
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Hoje" valor={totalHoje} icone={CalendarCheck} />
        <KpiCard label="Nesta semana" valor={totalSemana} icone={Calendar} />
        <KpiCard label="A confirmar" valor={aConfirmar} icone={Hourglass} />
        <KpiCard label="Confirmados" valor={confirmados} icone={Clock} />
      </section>

      {/* Faixa de semana */}
      <section className="wr-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => setOffset((o) => o - 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{rotuloSemana}</span>
          <button type="button" onClick={() => setOffset((o) => o + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }} aria-label="Próxima semana">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {semana.map((d) => {
            const k = chaveDia(d);
            const n = (porDia.get(k) ?? []).length;
            const sel = k === selecionado;
            const eHoje = k === hojeKey;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelecionado(k)}
                className="flex flex-col items-center gap-1 rounded-xl py-2.5 transition-colors"
                style={{
                  background: sel ? "#D7F36A" : "transparent",
                  color: sel ? "#16181D" : "var(--color-text)",
                  border: eHoje && !sel ? "1px solid rgba(215,243,106,0.5)" : "1px solid transparent",
                }}
              >
                <span className="text-[11px] uppercase" style={{ opacity: 0.7 }}>{DIAS[d.getDay()]}</span>
                <span className="text-base font-bold tabular-nums leading-none">{d.getDate()}</span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: n > 0 ? (sel ? "#16181D" : "#D7F36A") : "transparent" }} aria-hidden />
              </button>
            );
          })}
        </div>
      </section>

      {/* Lista do dia */}
      <section className="space-y-3">
        <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
          {new Date(selecionado + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
        </h2>
        {doDia.length === 0 ? (
          <div className="wr-card p-10 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhum compromisso neste dia.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {doDia.map((c) => {
              const tp = TIPO_CFG[c.tipo] ?? TIPO_CFG.compromisso!;
              const st = STATUS_CFG[c.status] ?? STATUS_CFG.agendado!;
              const hora = c.dia_inteiro
                ? "Dia inteiro"
                : new Date(c.data_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) +
                  (c.data_fim ? ` – ${new Date(c.data_fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "");
              const localTxt = [c.local, c.municipio].filter(Boolean).join(" · ");
              return (
                <Link key={c.id} href={`/app/politico/agenda/${c.id}`} className="wr-card flex items-center gap-4 p-4 transition-shadow duration-200 hover:shadow-md">
                  <div className="w-24 shrink-0 text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{hora}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold" style={{ color: "var(--color-text)" }}>{c.titulo}</div>
                    {localTxt && <div className="mt-0.5 truncate text-xs" style={{ color: "var(--color-text-muted)" }}>{localTxt}</div>}
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tp.bg, color: tp.fg }}>{tp.label}</span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

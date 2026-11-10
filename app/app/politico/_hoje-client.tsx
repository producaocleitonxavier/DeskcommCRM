"use client";

/**
 * Corpo visual da tela "Hoje" (War Room 2.0). Client component: usa Recharts
 * (via components/politico/*) e ícones LucideIcon. Recebe os dados já buscados
 * pelo server component (page.tsx) como props serializáveis.
 */

import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Construction,
  FileText,
  Flame,
  Gift,
  Inbox,
  Send,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { FunnelBoard } from "@/components/politico/funnel-board";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { AreaChartCard } from "@/components/politico/area-chart-card";
import { SectionHeader } from "@/components/politico/section-header";
import type { MetricasHoje, GabineteHoje, FilaDeAcao, MeuTrabalho, PlacarMembro } from "./page";

// Hexes do funil (espelham --wr-funnel-1..5) — Recharts aplica fill como
// atributo SVG, onde var(--x) não é confiável.
const FUNIL_HEX = ["#A5B4FC", "#818CF8", "#6366F1", "#4F46E5", "#4338CA"];

type Tipo = "risk" | "warn" | "ok";

const TIPO_CORES: Record<Tipo, { soft: string; strong: string }> = {
  risk: { soft: "#FBE4E2", strong: "#A3302A" },
  warn: { soft: "#FCF1DC", strong: "#8A5A10" },
  ok: { soft: "#E2F5EC", strong: "#17784F" },
};

export interface HojeClientProps {
  metrics: MetricasHoje;
  gabineteHoje: GabineteHoje;
  filaAcao: FilaDeAcao;
  nome: string;
  saudacao: string;
  dataFormatada: string;
  horaAtualizacao: string;
  /** Usuário tem Lideranças no menu? (perfil rua NÃO tem) → esconde "Nova liderança". */
  podeLiderancas?: boolean;
  /** O que ESTE usuário produziu na semana (cadastros/demandas/visitas/QR). */
  meuTrabalho: MeuTrabalho;
  /** Placar da equipe (só pro gestor) — produção de cada membro na semana. null = não é gestor. */
  placarEquipe?: PlacarMembro[] | null;
  /** Visitas realizadas prontas pra ofício (só gabinete). 0 = faixa some. */
  visitasProntasOficio?: number;
  /** Registros de Rua (captura de campo) ainda na mesa. 0 = card some. */
  registrosDeRua?: number;
  /** Vitórias (demandas resolvidas com foto) prontas pra virar card. 0 = some. */
  vitoriasPraMostrar?: number;
}

function badgeAtencao(a: GabineteHoje["atencao"][number]): { label: string; tipo: Tipo } {
  if (a.categoria === "atrasada") return { label: "Atrasada", tipo: "risk" };
  if (a.categoria === "vence") {
    if (!a.prazoISO) return { label: "Vence em breve", tipo: "warn" };
    const dias = Math.ceil((new Date(a.prazoISO).getTime() - Date.now()) / 86_400_000);
    return { label: dias <= 0 ? "Vence hoje" : `Vence em ${dias}d`, tipo: "warn" };
  }
  return { label: a.prioridade === "urgente" ? "Urgente" : "Alta prioridade", tipo: "warn" };
}

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function diaMes(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function badgeObra(o: GabineteHoje["obras"][number]): { label: string; tipo: Tipo } {
  if (o.categoria === "paralisada") return { label: "Paralisada", tipo: "risk" };
  if (o.categoria === "prazo_vencido") return { label: o.infoISO ? `Prazo venceu ${diaMes(o.infoISO)}` : "Prazo vencido", tipo: "risk" };
  return { label: "Sem vistoria +30d", tipo: "warn" };
}

/** Medidor circular (donut SVG) da taxa de resolução de demandas. */
function GaugeResolucao({ pct, resolvidas, total }: { pct: number; resolvidas: number; total: number }) {
  const size = 128;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.min(Math.max(pct, 0), 100);
  const offset = circ * (1 - p / 100);
  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
              {/* Anel todo em LIMA (verde do elmo) — antes ia até --icon-accent,
                  que na tela Hoje (branca) = navy → metade do anel sumia no hero
                  marinho. Agora pop total no hero. */}
              <stop offset="0%" stopColor="#E5F89E" />
              <stop offset="100%" stopColor="#C4E64A" />
            </linearGradient>
            <filter id="gaugeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            filter="url(#gaugeGlow)"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-[32px] font-bold leading-none" style={{ color: "#FFFFFF" }}>{pct}%</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.72)" }}>resolvidas</span>
        </div>
      </div>
      <div className="hidden sm:block">
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.88)" }}>
          <span className="font-bold">{resolvidas}</span> de {total}
        </div>
        <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>demandas resolvidas</div>
      </div>
    </div>
  );
}

// Iniciais e cor por nome — avatar do placar (mesmo espírito dos Multiplicadores).
function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  const ini = (p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1]?.[0] ?? "") : "");
  return ini.toUpperCase() || "?";
}
function hueDoNome(nome: string): number {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) % 360;
  return h;
}

/**
 * Placar da equipe (visão do GESTOR / Comando do Gabinete): quem produziu o quê
 * na semana. Reconhecimento, não vigilância. #1 em destaque; quem ainda não
 * produziu aparece mesmo assim (faz parte do time). No celular mostra nome +
 * total; o detalhe por tipo aparece no desktop.
 */
function PlacarEquipe({ linhas }: { linhas: PlacarMembro[] }) {
  const CHIPS = [
    { key: "cadastros", um: "cadastro", varios: "cadastros", Icone: UserPlus },
    { key: "demandas", um: "demanda", varios: "demandas", Icone: Inbox },
    { key: "visitas", um: "visita", varios: "visitas", Icone: Calendar },
    { key: "qr", um: "QR", varios: "QR", Icone: Sparkles },
  ] as const;
  return (
    <section aria-label="Placar da equipe" className="gip-glass p-6 sm:p-7">
      <SectionHeader
        title="Placar da equipe · esta semana"
        subtitle="O que cada pessoa do gabinete registrou — reconhecimento, não cobrança"
        action={{ label: "Ver equipe", href: "/app/team" }}
        className="mb-4"
      />
      <ul className="space-y-2.5">
        {linhas.map((l, i) => {
          const hue = hueDoNome(l.nome);
          const lider = i === 0 && l.total > 0;
          return (
            <li
              key={l.userId}
              className="flex items-center gap-3 rounded-xl p-2.5"
              style={{ background: lider ? "color-mix(in srgb, var(--color-accent) 9%, transparent)" : "rgba(127,127,127,0.06)" }}
            >
              <span className="w-5 shrink-0 text-center text-sm font-bold" style={{ color: "var(--color-text-subtle)" }}>
                {i + 1}
              </span>
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 48%), hsl(${(hue + 40) % 360} 62% 40%))` }}
              >
                {iniciaisDe(l.nome)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                {l.nome}
              </span>
              <div className="hidden items-center gap-3 sm:flex">
                {CHIPS.map(({ key, um, varios, Icone }) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 text-xs"
                    style={{ color: l[key] > 0 ? "var(--color-text-muted)" : "var(--color-text-subtle)" }}
                  >
                    <Icone className="h-3.5 w-3.5" aria-hidden />
                    <strong style={{ color: l[key] > 0 ? "var(--color-text)" : "inherit" }}>{l[key]}</strong>{" "}
                    {l[key] === 1 ? um : varios}
                  </span>
                ))}
              </div>
              <span
                className="ml-1 inline-flex min-w-[2.2rem] items-center justify-center rounded-full px-2.5 py-1 text-sm font-bold"
                style={{
                  background: l.total > 0 ? "var(--color-accent)" : "rgba(127,127,127,0.12)",
                  color: l.total > 0 ? "#14181F" : "var(--color-text-subtle)",
                }}
              >
                {l.total}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function HojeClient({
  metrics: m,
  gabineteHoje: g,
  filaAcao,
  nome,
  saudacao,
  dataFormatada,
  horaAtualizacao,
  podeLiderancas = false,
  meuTrabalho,
  placarEquipe = null,
  visitasProntasOficio = 0,
  registrosDeRua = 0,
  vitoriasPraMostrar = 0,
}: HojeClientProps) {
  // Funil de ATENDIMENTO (ciclo de vida da demanda) — não o funil de campanha.
  const lifecycleData = g.lifecycle.map((s, i) => ({
    label: s.label,
    value: s.count,
    color: FUNIL_HEX[i] ?? FUNIL_HEX[FUNIL_HEX.length - 1]!,
  }));
  const AREA_HEX = ["var(--color-accent)", "#60A5FA", "#F59E0B", "#22C55E", "#A78BFA", "#F472B6"];
  const porAreaData = g.porArea.map((a, i) => ({ name: a.name, value: a.value, fill: AREA_HEX[i % AREA_HEX.length]! }));
  const registradasData = g.registradas14d;

  return (
    <div className="gip-ambient-bg gip-stagger mx-auto max-w-[1140px] px-4 py-7 space-y-6">
      {/* ── 1. Centro de Comando (hero tático) ──────────────────── */}
      <header
        className="wr-card relative overflow-hidden p-6 sm:p-8"
        style={{
          background: "var(--hero-grad)",
          border: "1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full"
          style={{ background: "radial-gradient(closest-side,color-mix(in srgb, var(--color-accent) 16%, transparent),transparent)" }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--hero-eyebrow)" }}>
              GIP · Centro de Comando
            </span>
            <h1 className="font-heading mt-1.5 text-3xl font-bold leading-tight sm:text-4xl" style={{ color: "#FFFFFF" }}>
              {saudacao}
              {nome ? `, ${nome}` : ""}
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
              {dataFormatada} · atualizado às {horaAtualizacao}
              {g.resumo.nomeParlamentar ? ` · ${g.resumo.nomeParlamentar}` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/app/politico/campo"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-sm font-bold"
                style={{ background: "var(--color-accent)", color: "#14181F", boxShadow: "0 6px 20px color-mix(in srgb, var(--color-accent) 35%, transparent)" }}
              >
                <Camera className="h-4 w-4" aria-hidden /> Registrar na rua
              </Link>
              <Link
                href="/app/politico/demandas/nova"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
                style={{ border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)" }}
              >
                <Inbox className="h-4 w-4" aria-hidden /> Nova demanda
              </Link>
              {[
                { href: "/app/politico/demandas", label: "Demandas" },
                { href: "/app/agenda", label: "Agenda" },
                // "Nova liderança" só p/ quem tem Lideranças no menu (o gabinete
                // define liderança — o assessor de rua não). Gatado pelo MENU,
                // como as abas, pq rua e gabinete têm o mesmo papel (agent).
                ...(podeLiderancas
                  ? [{ href: "/app/politico/liderancas/novo", label: "Nova liderança" }]
                  : []),
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-medium transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)" }}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
          <GaugeResolucao pct={g.resumo.taxaResolucao} resolvidas={g.resumo.resolvidas} total={g.resumo.totalDemandas} />
        </div>
      </header>

      {/* ── Meu trabalho esta semana (placar pessoal — todo mundo vê o SEU) ── */}
      <section aria-label="Meu trabalho esta semana" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-sm font-bold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            Meu trabalho · esta semana
          </h2>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>o que você registrou</span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Cadastros" valor={meuTrabalho.cadastros} icone={UserPlus} />
          <KpiCard label="Demandas" valor={meuTrabalho.demandas} icone={Inbox} />
          <KpiCard label="Visitas em campo" valor={meuTrabalho.visitas} icone={Calendar} />
          <KpiCard label="Captados por QR" valor={meuTrabalho.qr} icone={Sparkles} />
        </div>
      </section>

      {/* ── Placar da equipe (só pro gestor) ─────────────────────── */}
      {placarEquipe && placarEquipe.length > 0 && <PlacarEquipe linhas={placarEquipe} />}

      {/* ── Fila de ação: o que espera a sua decisão AGORA ───────── */}
      {(filaAcao.rascunhosIA > 0 || filaAcao.disparosRascunho > 0 || filaAcao.leadsQuentesSemContato > 0 || visitasProntasOficio > 0 || registrosDeRua > 0 || vitoriasPraMostrar > 0) && (
        <section aria-label="Esperando você" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Visitas de campo que já foram feitas e esperam o ofício do gabinete.
              O relato do assessor está na demanda; aqui é só o "pronto pra oficializar". */}
          {visitasProntasOficio > 0 && (
            <Link
              href="/app/politico/demandas?prontas_oficio=1#lista-demandas"
              className="gip-glass gip-glass-hover flex items-center gap-3 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(16,185,129,0.14)", color: "#0E8A5F" }} aria-hidden>
                <FileText className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold leading-none tabular-nums" style={{ color: "var(--color-text)" }}>
                  {visitasProntasOficio.toLocaleString("pt-BR")}
                </span>
                <span className="mt-0.5 block text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {visitasProntasOficio === 1 ? "visita feita, pronta pra ofício" : "visitas feitas, prontas pra ofício"}
                </span>
              </span>
            </Link>
          )}
          {/* Registros de Rua: o que os assessores captaram no campo e está na mesa.
              Um clique → o quadro só com esses (origem=campo). */}
          {registrosDeRua > 0 && (
            <Link
              href="/app/politico/demandas?origem=campo#lista-demandas"
              className="gip-glass-hover flex items-center gap-3 rounded-2xl p-4"
              style={{
                background: "color-mix(in srgb, var(--color-accent) 9%, var(--color-surface))",
                border: "1px solid color-mix(in srgb, var(--color-accent) 32%, transparent)",
              }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--color-accent)", color: "#14181F" }} aria-hidden>
                <Camera className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold leading-none tabular-nums" style={{ color: "var(--color-text)" }}>
                  {registrosDeRua.toLocaleString("pt-BR")}
                </span>
                <span className="mt-0.5 block text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {registrosDeRua === 1 ? "registro de rua realizado" : "registros de rua realizados"}
                </span>
              </span>
            </Link>
          )}
          {/* Vitórias: demandas resolvidas com foto, prontas pra virar card
              Antes & Depois. A situação política não passa batido. */}
          {vitoriasPraMostrar > 0 && (
            <Link
              href="/app/politico/vitorias"
              className="gip-glass-hover flex items-center gap-3 rounded-2xl p-4"
              style={{
                background: "color-mix(in srgb, #16A34A 10%, var(--color-surface))",
                border: "1px solid color-mix(in srgb, #16A34A 32%, transparent)",
              }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#16A34A", color: "#FFFFFF" }} aria-hidden>
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold leading-none tabular-nums" style={{ color: "var(--color-text)" }}>
                  {vitoriasPraMostrar.toLocaleString("pt-BR")}
                </span>
                <span className="mt-0.5 block text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {vitoriasPraMostrar === 1 ? "vitória pra mostrar" : "vitórias pra mostrar"}
                </span>
              </span>
            </Link>
          )}
          {filaAcao.rascunhosIA > 0 && (
            <Link
              href="/app/inbox"
              className="gip-glass gip-glass-hover flex items-center gap-3 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-accent) 14%, transparent)", color: "var(--icon-accent)" }} aria-hidden>
                <Sparkles className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold leading-none tabular-nums" style={{ color: "var(--color-text)" }}>
                  {filaAcao.rascunhosIA.toLocaleString("pt-BR")}
                </span>
                <span className="mt-0.5 block text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {filaAcao.rascunhosIA === 1 ? "resposta da IA pra aprovar" : "respostas da IA pra aprovar"}
                </span>
              </span>
            </Link>
          )}
          {filaAcao.disparosRascunho > 0 && (
            <Link
              href="/app/campaigns"
              className="gip-glass gip-glass-hover flex items-center gap-3 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(59,130,246,0.14)", color: "#3B82F6" }} aria-hidden>
                <Send className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold leading-none tabular-nums" style={{ color: "var(--color-text)" }}>
                  {filaAcao.disparosRascunho.toLocaleString("pt-BR")}
                </span>
                <span className="mt-0.5 block text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {filaAcao.disparosRascunho === 1 ? "disparo em rascunho pra revisar" : "disparos em rascunho pra revisar"}
                </span>
              </span>
            </Link>
          )}
          {filaAcao.leadsQuentesSemContato > 0 && (
            <Link
              href="/app/politico/leads?esfriando=1"
              className="gip-glass gip-glass-hover flex items-center gap-3 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(239,68,68,0.14)", color: "#F87171" }} aria-hidden>
                <Flame className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold leading-none tabular-nums" style={{ color: "var(--color-text)" }}>
                  {filaAcao.leadsQuentesSemContato.toLocaleString("pt-BR")}
                </span>
                <span className="mt-0.5 block text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {filaAcao.leadsQuentesSemContato === 1 ? "contato quente esfriando — fale com ele" : "contatos quentes esfriando — fale com eles"}
                </span>
              </span>
            </Link>
          )}
        </section>
      )}

      {/* ── 1b. No gabinete hoje ────────────────────────────────── */}
      <section aria-label="No gabinete hoje" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Precisam de atenção */}
        <div className="gip-glass p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "#FBE4E2", color: "#A3302A" }} aria-hidden>
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Precisam de atenção</h2>
          </div>
          {g.atencao.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhuma demanda atrasada ou urgente. 👏</p>
          ) : (
            <ul className="space-y-1.5">
              {g.atencao.map((a) => {
                const b = badgeAtencao(a);
                const c = TIPO_CORES[b.tipo];
                return (
                  <li key={a.id}>
                    <Link href={`/app/politico/demandas/${a.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-elevated)]">
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: c.soft, color: c.strong }}>{b.label}</span>
                      <span className="truncate text-sm" style={{ color: "var(--color-text)" }}>{a.assunto}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Agenda de hoje */}
        <div className="gip-glass p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(59,130,246,0.14)", color: "#3B82F6" }} aria-hidden>
                <Calendar className="h-4 w-4" />
              </span>
              <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Agenda de hoje</h2>
            </div>
            <Link href="/app/agenda" className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>ver tudo</Link>
          </div>
          {g.agenda.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Sem compromissos hoje.</p>
          ) : (
            <ul className="space-y-1.5">
              {g.agenda.map((c) => (
                <li key={c.id}>
                  <Link href="/app/agenda" className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-elevated)]">
                    <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--color-text-muted)", minWidth: 42 }}>
                      {c.diaInteiro ? "dia" : horaDe(c.dataISO)}
                    </span>
                    <span className="truncate text-sm" style={{ color: "var(--color-text)" }}>
                      {c.titulo}
                      {c.local ? <span style={{ color: "var(--color-text-subtle)" }}> · {c.local}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Aniversariantes */}
        <div className="gip-glass p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--color-accent) 18%, transparent)", color: "var(--icon-accent)" }} aria-hidden>
              <Gift className="h-4 w-4" />
            </span>
            <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Aniversariantes (lideranças)</h2>
          </div>
          {g.aniversariantes.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhum aniversário de liderança hoje.</p>
          ) : (
            <ul className="space-y-1.5">
              {g.aniversariantes.map((l) => (
                <li key={l.id}>
                  <Link href={`/app/politico/liderancas/${l.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-elevated)]">
                    <span className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>{l.nome}</span>
                    {l.cidade ? <span className="shrink-0 text-xs" style={{ color: "var(--color-text-subtle)" }}>{l.cidade}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── 1c. Obras que pedem ação (só quando há) ─────────────── */}
      {g.obras.length > 0 && (
        <section aria-label="Obras que pedem ação" className="gip-glass p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "rgba(245,158,11,0.16)", color: "#B45309" }} aria-hidden>
                <Construction className="h-4 w-4" />
              </span>
              <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Obras que pedem ação</h2>
            </div>
            <Link href="/app/politico/obras" className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>ver tudo</Link>
          </div>
          <p className="mb-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Paralisadas, com prazo vencido ou sem vistoria há mais de 30 dias — o que não pode ficar parado hoje.
          </p>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {g.obras.map((o) => {
              const b = badgeObra(o);
              const c = TIPO_CORES[b.tipo];
              return (
                <li key={o.id}>
                  <Link href={`/app/politico/obras/${o.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-elevated)]">
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: c.soft, color: c.strong }}>{b.label}</span>
                    <span className="truncate text-sm" style={{ color: "var(--color-text)" }}>{o.titulo}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── 2. KPIs do gabinete ─────────────────────────────────── */}
      <section aria-label="Números principais" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Base de contatos" valor={m.totalPessoas} icone={Users} />
        <KpiCard label="Demandas abertas" valor={g.resumo.abertas} icone={Inbox} />
        <KpiCard label="Resolvidas este mês" valor={g.resumo.resolvidasMes} icone={CheckCircle2} />
        <KpiCard
          label="Tempo médio (dias)"
          valor={g.resumo.tempoMedioDias ?? 0}
          icone={Clock}
        />
      </section>

      {/* ── 3. Funil de atendimento (ciclo da demanda) ──────────── */}
      <section className="gip-glass p-6 sm:p-7">
        <SectionHeader
          title="Funil de atendimento"
          subtitle="O caminho de cada demanda até a resolução"
          action={{ label: "Ver demandas", href: "/app/politico/demandas" }}
          className="mb-2"
        />
        <FunnelBoard data={lifecycleData} className="mt-5" />
      </section>

      {/* ── 4. Demandas por área + evolução ─────────────────────── */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BarChartCard title="Demandas por área" data={porAreaData} />
        <AreaChartCard title="Registradas (últimos 14 dias)" data={registradasData} color="#C4E64A" />
      </section>
    </div>
  );
}

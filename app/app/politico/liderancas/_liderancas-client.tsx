"use client";

/**
 * Corpo visual da rede de Lideranças (War Room 2.0): KPIs, próximos aniversários
 * e cards (horizontais no desktop). Client component — recebe os dados já
 * buscados pelo server (page.tsx).
 *
 * Os botões "Adicionar Liderança" e "Detalhes" apontam para rotas ainda não
 * criadas (/liderancas/novo e /liderancas/{id}) — pendentes de um prompt de
 * backend/CRUD.
 */

import Link from "next/link";
import {
  CalendarCheck,
  Cake,
  ChevronRight,
  MapPin,
  Megaphone,
  MessageCircle,
  Users,
} from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";
import { ExportCsv } from "@/components/politico/export-csv";
import { CommandHero } from "@/components/politico/command-hero";
import type { Lideranca } from "./page";

const TIPO_LABELS: Record<string, string> = {
  cabo_eleitoral: "Cabo eleitoral",
  coordenador_bairro: "Coord. bairro",
  coordenador_cidade: "Coord. cidade",
  lider_comunitario: "Líder comunitário",
  vereador_aliado: "Vereador aliado",
  presidente_associacao: "Pres. associação",
  lider_religioso: "Líder religioso",
  lider_sindical: "Líder sindical",
  assessor: "Assessor",
  outro: "Outro",
};

const STATUS_CFG: Record<string, { label: string; bg: string; fg: string }> = {
  ativo: { label: "Ativo", bg: "#E2F5EC", fg: "#17784F" },
  inativo: { label: "Inativo", bg: "#F0F0EB", fg: "#5B606B" },
  suspenso: { label: "Suspenso", bg: "#FCF1DC", fg: "#8A5A10" },
};

const ENGAJAMENTO_CFG: Record<string, { label: string; bg: string; fg: string }> = {
  baixo: { label: "Engajamento baixo", bg: "#F0F0EB", fg: "#5B606B" },
  medio: { label: "Engajamento médio", bg: "#E4E7F8", fg: "#2F3DA8" },
  alto: { label: "Engajamento alto", bg: "#E2F5EC", fg: "#17784F" },
  critico: { label: "Engajamento crítico", bg: "#FBE4E2", fg: "#A3302A" },
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase() || "?";
}

function proximosAniversarios(liderancas: Lideranca[]) {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const diaAtual = hoje.getDate();
  return liderancas
    .filter((l) => l.aniversario)
    .map((l) => {
      const [, mes = 1, dia = 1] = l.aniversario!.split("-").map(Number);
      let diasAte = (mes - mesAtual) * 30 + (dia - diaAtual);
      if (diasAte < 0) diasAte += 365;
      return { l, mes, dia, diasAte };
    })
    .sort((a, b) => a.diasAte - b.diasAte)
    .slice(0, 5);
}

export interface LiderancasClientProps {
  liderancas: Lideranca[];
}

export default function LiderancasClient({ liderancas }: LiderancasClientProps) {
  const ativas = liderancas.filter((l) => l.status === "ativo").length;
  const totalMobilizados = liderancas.reduce((s, l) => s + (l.leads_mobilizados ?? 0), 0);
  const totalEventos = liderancas.reduce((s, l) => s + (l.eventos_organizados ?? 0), 0);
  const comWhatsapp = liderancas.filter((l) => l.whatsapp).length;
  const aniversariantes = proximosAniversarios(liderancas);

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Gabinete · Lideranças"
        titulo="Lideranças"
        subtitulo="Rede de mobilização — aniversários, WhatsApp e engajamento."
        acoes={[{ href: "/app/politico/liderancas/novo", label: "+ Adicionar liderança", primary: true }]}
      />

      {liderancas.length > 0 && (
        <div className="flex justify-end">
          <ExportCsv
            filename="liderancas.csv"
            headers={["Nome", "Apelido", "Tipo", "Cargo", "Cidade", "Bairro", "WhatsApp", "Aniversário", "Mobilizados", "Eventos", "Engajamento", "Status"]}
            rows={liderancas.map((l) => [
              l.nome, l.apelido, TIPO_LABELS[l.tipo] ?? l.tipo, l.cargo, l.cidade, l.bairro,
              l.whatsapp, l.aniversario, l.leads_mobilizados, l.eventos_organizados, l.nivel_engajamento, l.status,
            ])}
          />
        </div>
      )}

      {liderancas.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhuma liderança cadastrada"
          description="Cadastre suas lideranças para acompanhar aniversários, mobilização e engajamento da rede."
          action={{ label: "Adicionar liderança", href: "/app/politico/liderancas/novo" }}
        />
      ) : (
        <>
          {/* ── KPIs ──────────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Lideranças ativas" valor={ativas} icone={Users} />
            <KpiCard label="Leads mobilizados" valor={totalMobilizados} icone={Megaphone} />
            <KpiCard label="Eventos organizados" valor={totalEventos} icone={CalendarCheck} />
            <KpiCard label="Com WhatsApp" valor={comWhatsapp} icone={MessageCircle} />
          </section>

          {/* ── Próximos aniversários ─────────────────────────────── */}
          {aniversariantes.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Próximos aniversários" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {aniversariantes.map(({ l, mes, dia }) => (
                  <div key={l.id} className="wr-card flex items-center gap-3 p-4">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "var(--color-accent-50)" }}
                      aria-hidden
                    >
                      <Cake className="h-4 w-4" style={{ color: "var(--color-accent-700)" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.apelido ?? l.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {String(dia).padStart(2, "0")}/{String(mes).padStart(2, "0")}
                        {l.whatsapp ? " · WhatsApp" : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Cards ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeader title={`Todas as lideranças (${liderancas.length})`} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {liderancas.map((l) => {
                const nome = l.apelido ?? l.nome;
                const st = STATUS_CFG[l.status] ?? { label: l.status, bg: "#F0F0EB", fg: "#5B606B" };
                const eng = ENGAJAMENTO_CFG[l.nivel_engajamento] ?? ENGAJAMENTO_CFG.medio!;
                const regiao = [l.cidade, l.bairro].filter(Boolean).join(" · ");
                return (
                  <div
                    key={l.id}
                    className="wr-card flex flex-col gap-4 p-5 transition-shadow duration-200 hover:shadow-md sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ background: "linear-gradient(135deg, #6B79DD 0%, #26318F 100%)" }}
                        aria-hidden
                      >
                        {iniciais(nome)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold leading-tight">{nome}</span>
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: st.bg, color: st.fg }}
                          >
                            {st.label}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {l.cargo ?? TIPO_LABELS[l.tipo] ?? l.tipo}
                        </div>
                        {regiao && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" aria-hidden />
                            {regiao}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-5">
                      <div className="text-center">
                        <div className="font-heading text-lg font-bold tabular-nums leading-none">
                          {(l.leads_mobilizados ?? 0).toLocaleString("pt-BR")}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">mobilizados</div>
                      </div>
                      <div className="text-center">
                        <div className="font-heading text-lg font-bold tabular-nums leading-none">
                          {(l.eventos_organizados ?? 0).toLocaleString("pt-BR")}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">eventos</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: eng.bg, color: eng.fg }}
                      >
                        {eng.label}
                      </span>
                      <Link href={`/app/politico/liderancas/${l.id}`} className="wr-btn text-sm">
                        Detalhes
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

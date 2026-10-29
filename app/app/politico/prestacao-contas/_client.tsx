"use client";

/**
 * Painel do Mandato — visual da prestação de contas. Apresentacional: recebe os
 * números já calculados pela página servidor. KPIs (KpiCard) + evolução + top
 * bairros, com filtro de período. Gráficos em CSS (sem dependência pesada) —
 * simples, premium e à prova de criança.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, FileText, Building2, Hammer, Coins, Users, MessageSquare, MapPin, Download, Loader2, Target, Check, X, TrendingUp } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { KpiCard } from "@/components/politico/kpi-card";
import { gerarRelatorioPrestacaoContas } from "@/app/actions/politico/gerarRelatorioPrestacaoContas";
import { definirMetasDoMandato } from "@/app/actions/politico/definirMetasDoMandato";
import type { PrestacaoContas, Periodo } from "@/lib/politico/prestacao-contas-dados";
import type { OndeInvestir, Leitura } from "@/lib/politico/onde-investir";

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "mes", label: "Este mês" },
  { id: "trimestre", label: "Trimestre" },
  { id: "mandato", label: "Mandato inteiro" },
];

function reais(v: number): string {
  if (v >= 1_000_000) return "R$ " + (v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if (v >= 1_000) return "R$ " + (v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  return "R$ " + v.toLocaleString("pt-BR");
}

const METAS_DEF: { chave: "demandas" | "oficios" | "obras" | "base"; label: string }[] = [
  { chave: "demandas", label: "Demandas atendidas" },
  { chave: "oficios", label: "Ofícios emitidos" },
  { chave: "obras", label: "Obras entregues" },
  { chave: "base", label: "Pessoas na base" },
];

const LEITURA_ESTILO: Record<Leitura, { rotulo: string; bg: string; cor: string }> = {
  oportunidade: { rotulo: "🎯 Oportunidade", bg: "rgba(215,243,106,0.18)", cor: "#5E7A10" },
  fortaleza: { rotulo: "💪 Fortaleza", bg: "rgba(23,120,79,0.12)", cor: "#17784F" },
  acompanhar: { rotulo: "Acompanhar", bg: "var(--color-surface-elevated)", cor: "var(--color-text-muted)" },
};

export default function PrestacaoContasClient({ dados, ondeInvestir, ehAdmin }: { dados: PrestacaoContas; ondeInvestir: OndeInvestir; ehAdmin: boolean }) {
  const router = useRouter();
  const maxEvol = Math.max(1, ...dados.evolucao.map((e) => e.valor));
  const maxBairro = Math.max(1, ...dados.topBairros.map((b) => b.valor));

  const [gerando, setGerando] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);

  const [editMetas, setEditMetas] = useState(false);
  const [salvandoMetas, setSalvandoMetas] = useState(false);
  const [mDemandas, setMDemandas] = useState(dados.metas.demandas != null ? String(dados.metas.demandas) : "");
  const [mOficios, setMOficios] = useState(dados.metas.oficios != null ? String(dados.metas.oficios) : "");
  const [mObras, setMObras] = useState(dados.metas.obras != null ? String(dados.metas.obras) : "");
  const [mBase, setMBase] = useState(dados.metas.base != null ? String(dados.metas.base) : "");

  const temMeta = METAS_DEF.some((d) => dados.metas[d.chave] != null);
  const realizado: Record<string, number> = {
    demandas: dados.totaisMandato.demandas,
    oficios: dados.totaisMandato.oficios,
    obras: dados.totaisMandato.obras,
    base: dados.totaisMandato.base,
  };

  async function salvarMetas() {
    setSalvandoMetas(true);
    const num = (s: string) => {
      const n = parseInt(s.replace(/\D+/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const r = await definirMetasDoMandato({ demandas: num(mDemandas), oficios: num(mOficios), obras: num(mObras), base: num(mBase) });
    setSalvandoMetas(false);
    if (r.ok) {
      setEditMetas(false);
      router.refresh();
    }
  }
  async function gerarPdf() {
    setErroPdf(null);
    setGerando(true);
    const r = await gerarRelatorioPrestacaoContas(dados.periodo);
    setGerando(false);
    if (!r.ok) {
      setErroPdf(r.erro);
      return;
    }
    window.open(r.url, "_blank", "noopener");
  }

  return (
    <div className="mx-auto max-w-[1140px] space-y-[18px] px-4 py-7">
      <CommandHero
        eyebrow="Gabinete · Prestação de Contas"
        titulo="Painel do Mandato"
        subtitulo="O trabalho do mandato em números — demandas atendidas, ofícios, obras, emendas e a base crescendo. A conta que o cidadão vê."
      />

      {/* Filtro de período + gerar PDF */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODOS.map((p) => {
            const on = dados.periodo === p.id;
            return (
              <Link
                key={p.id}
                href={`/app/politico/prestacao-contas?periodo=${p.id}`}
                className="inline-flex items-center h-9 px-4 rounded-full text-sm font-semibold transition-colors"
                style={on ? { background: "#16181D", color: "#FFFFFF" } : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          onClick={gerarPdf}
          disabled={gerando}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "#D7F36A", color: "#16181D" }}
        >
          {gerando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {gerando ? "Gerando…" : "Gerar relatório (PDF)"}
        </button>
      </div>
      {erroPdf && <p className="text-sm font-medium" style={{ color: "#F87171" }}>{erroPdf}</p>}

      {/* Números do mandato */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Demandas atendidas" valor={dados.demandasAtendidas} icone={CheckCircle2} variant="dark" />
        <KpiCard label="Tempo médio de resolução" valor={dados.tempoMedioDias ?? "—"} sufixo={dados.tempoMedioDias != null ? " dias" : undefined} icone={Clock} />
        <KpiCard label="Ofícios emitidos" valor={dados.oficios} icone={FileText} />
        <KpiCard label="Avisos ao cidadão" valor={dados.avisos} icone={MessageSquare} />
        <KpiCard label="Obras entregues" valor={dados.obrasEntregues} icone={Building2} />
        <KpiCard label="Obras em andamento" valor={dados.obrasAndamento} icone={Hammer} />
        <KpiCard label="Emendas destinadas" valor={dados.emendasQtd > 0 ? reais(dados.emendasValor) : "—"} icone={Coins} />
        <KpiCard label={dados.baseNovos > 0 ? `Pessoas na base (+${dados.baseNovos} no período)` : "Pessoas na base"} valor={dados.baseTotal} icone={Users} />
      </div>

      {/* Metas do mandato */}
      <section className="wr-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target size={18} style={{ color: "#8AA62E" }} />
            <h2 className="font-heading text-xl font-bold leading-tight">Metas do mandato</h2>
          </div>
          {ehAdmin && !editMetas && (
            <button
              type="button"
              onClick={() => setEditMetas(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
            >
              {temMeta ? "Ajustar metas" : "Definir metas"}
            </button>
          )}
        </div>

        {editMetas ? (
          <div className="mt-4">
            <p className="mb-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Quanto o mandato quer alcançar, no total. Deixe em branco o que não quiser acompanhar.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([["Demandas atendidas", mDemandas, setMDemandas], ["Ofícios emitidos", mOficios, setMOficios], ["Obras entregues", mObras, setMObras], ["Pessoas na base", mBase, setMBase]] as const).map(([lab, val, set]) => (
                <div key={lab}>
                  <label className="mb-1 block text-[13px] font-semibold">{lab}</label>
                  <input
                    inputMode="numeric"
                    className="wr-input w-full"
                    value={val}
                    onChange={(e) => set(e.target.value.replace(/\D+/g, ""))}
                    placeholder="Ex.: 100"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={salvarMetas}
                disabled={salvandoMetas}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "#D7F36A", color: "#16181D" }}
              >
                {salvandoMetas ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {salvandoMetas ? "Salvando…" : "Salvar metas"}
              </button>
              <button
                type="button"
                onClick={() => setEditMetas(false)}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
              >
                <X size={15} /> Cancelar
              </button>
            </div>
          </div>
        ) : temMeta ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {METAS_DEF.filter((d) => dados.metas[d.chave] != null).map((d) => {
              const meta = dados.metas[d.chave] as number;
              const feito = realizado[d.chave] ?? 0;
              const pct = Math.min(100, Math.round((feito / meta) * 100));
              const bateu = feito >= meta;
              return (
                <div key={d.chave}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{d.label}</span>
                    <span className="font-bold" style={{ color: bateu ? "#17784F" : "var(--color-text-muted)" }}>
                      {feito.toLocaleString("pt-BR")} / {meta.toLocaleString("pt-BR")} {bateu ? "✓" : `· ${pct}%`}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-elevated)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bateu ? "#17784F" : "#D7F36A" }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm" style={{ color: "var(--color-text-subtle)" }}>
            {ehAdmin ? "Defina metas para acompanhar o progresso do mandato." : "O gabinete ainda não definiu metas."}
          </p>
        )}
      </section>

      {/* Onde investir (inteligência preditiva: demandas × votos por bairro) */}
      <section className="wr-card p-6">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} style={{ color: "#8AA62E" }} />
          <h2 className="font-heading text-xl font-bold leading-tight">Onde investir</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Cruzamos onde o cidadão mais pede ajuda com onde você tem votos. Bairro que pede e quase não vota é a sua maior oportunidade.
        </p>
        {!ondeInvestir.temTse ? (
          <p className="mt-4 text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Para ver esta leitura, vincule o parlamentar ao candidato no TSE (na Inteligência Eleitoral).
          </p>
        ) : ondeInvestir.itens.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Assim que houver demandas com o bairro informado, a leitura aparece aqui — por bairro.
          </p>
        ) : (
          <div className="mt-5 space-y-2.5">
            {ondeInvestir.itens.map((b) => {
              const s = LEITURA_ESTILO[b.leitura];
              return (
                <div
                  key={b.bairro}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] p-3"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)" }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{b.bairro}</p>
                    <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                      {b.demandas} {b.demandas === 1 ? "pedido" : "pedidos"} · {b.votos.toLocaleString("pt-BR")} {b.votos === 1 ? "voto" : "votos"} seus aqui
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold" style={{ background: s.bg, color: s.cor }}>
                    {s.rotulo}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-[18px] lg:grid-cols-2">
        {/* Evolução */}
        <section className="wr-card p-6">
          <h2 className="font-heading text-xl font-bold leading-tight">Demandas resolvidas por mês</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Últimos 6 meses.</p>
          <div className="mt-5 flex items-end justify-between gap-2" style={{ height: 160 }}>
            {dados.evolucao.map((e, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height: "100%" }}>
                <span className="text-[11px] font-bold" style={{ color: "var(--color-text-muted)" }}>{e.valor}</span>
                <div
                  className="w-full rounded-t-[6px]"
                  style={{ height: `${Math.max(4, (e.valor / maxEvol) * 120)}px`, background: e.valor > 0 ? "#D7F36A" : "var(--color-border)", minHeight: 4 }}
                />
                <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{e.mes}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top bairros */}
        <section className="wr-card p-6">
          <div className="flex items-center gap-2">
            <MapPin size={18} style={{ color: "#8AA62E" }} />
            <h2 className="font-heading text-xl font-bold leading-tight">Onde o trabalho aconteceu</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Bairros mais atendidos.</p>
          {dados.topBairros.length === 0 ? (
            <p className="mt-6 text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Ainda não há demandas com bairro informado neste período.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {dados.topBairros.map((b) => (
                <div key={b.bairro}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{b.bairro}</span>
                    <span className="font-bold" style={{ color: "var(--color-text-muted)" }}>{b.valor}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-elevated)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(b.valor / maxBairro) * 100}%`, background: "#D7F36A" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

    </div>
  );
}

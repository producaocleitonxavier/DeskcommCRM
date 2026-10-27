/**
 * /app/instagram/automacoes — Lista de flows de automação (War Room 2.0)
 *
 * Lista todos os flows de automação (triggers + ações) da organização.
 * Permite criar, ativar/desativar e editar flows.
 *
 * Acesso: admin (gate no layout). Visual: padrão War Room dark (CommandHero +
 * KpiCard + tokens de tema), igual às telas do módulo político.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Zap, CheckCircle2, PauseCircle, Pencil, Trash2 } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { EmptyState } from "@/components/politico/empty-state";

export const dynamic = "force-dynamic";

// ── Tipos ────────────────────────────────────────────────────────────────────

type TriggerTipo =
  | "comment_keyword"
  | "comment_no_post"
  | "dm_keyword"
  | "novo_seguidor"
  | "story_reply"
  | "novo_comentario";

type AcaoTipo =
  | "enviar_dm"
  | "responder_comentario"
  | "add_etiqueta"
  | "criar_contato"
  | "notificar_equipe"
  | "add_funil_politico";

interface AcaoConfig {
  tipo: AcaoTipo;
  texto?: string;
  etiqueta?: string;
  nivel?: string;
  mensagem?: string;
}

interface FlowRow {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  trigger_tipo: TriggerTipo;
  trigger_config: Record<string, unknown>;
  acoes: AcaoConfig[];
  ultima_ativacao_at: string | null;
  created_at: string;
}

// ── Labels de display ────────────────────────────────────────────────────────

const TRIGGER_LABEL: Record<TriggerTipo, string> = {
  comment_keyword: "Palavra-chave no comentário",
  comment_no_post: "Qualquer comentário no post",
  dm_keyword: "Palavra-chave em DM",
  novo_seguidor: "Novo seguidor",
  story_reply: "Resposta de Story",
  novo_comentario: "Qualquer comentário (catch-all)",
};

const ACAO_LABEL: Record<AcaoTipo, string> = {
  enviar_dm: "Enviar DM",
  responder_comentario: "Responder comentário",
  add_etiqueta: "Adicionar etiqueta",
  criar_contato: "Criar contato",
  notificar_equipe: "Notificar equipe",
  add_funil_politico: "Funil político",
};

// ── Hook de dados ────────────────────────────────────────────────────────────

function useFlows() {
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/v1/ig-automation-flows?limit=100");
      if (!res.ok) throw new Error("Erro ao carregar flows");
      const json = await res.json();
      setFlows(json.data?.flows ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { flows, carregando, erro, recarregar: carregar };
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function AutomacoesInstagramPage() {
  const { flows, carregando, erro, recarregar } = useFlows();
  const [alterandoId, setAlterandoId] = useState<string | null>(null);

  async function toggleAtivo(flow: FlowRow) {
    setAlterandoId(flow.id);
    try {
      await fetch(`/api/v1/ig-automation-flows/${flow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !flow.ativo }),
      });
      await recarregar();
    } finally {
      setAlterandoId(null);
    }
  }

  async function excluir(flow: FlowRow) {
    if (!confirm(`Excluir flow "${flow.nome}"?`)) return;
    setAlterandoId(flow.id);
    try {
      await fetch(`/api/v1/ig-automation-flows/${flow.id}`, { method: "DELETE" });
      await recarregar();
    } finally {
      setAlterandoId(null);
    }
  }

  const ativos = flows.filter((f) => f.ativo).length;
  const inativos = flows.length - ativos;

  return (
    <div className="mx-auto max-w-[1140px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      {/* Header branded GIPCHAT (com o elmo da Guerrilheiros) */}
      <header
        className="wr-card relative overflow-hidden p-6 sm:p-7"
        style={{ background: "linear-gradient(135deg,#0E1116 0%,#14181F 55%,#1A2410 100%)", border: "1px solid rgba(215,243,106,0.22)" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full" style={{ background: "radial-gradient(closest-side,rgba(215,243,106,0.16),transparent)" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            {/* Elmo da Guerrilheiros (recortado pra focar no capacete, sem o texto de baixo). */}
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
              style={{ background: "#0A0C10", boxShadow: "0 0 16px rgba(215,243,106,0.28)", border: "1px solid rgba(215,243,106,0.25)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gipchat-elmo.png" alt="GIPCHAT" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#D7F36A" }}>Instagram · Automação</span>
              <h1 className="font-heading mt-1 text-3xl font-bold leading-tight" style={{ color: "#FFFFFF" }}>GIPCHAT</h1>
              <p className="mt-1 max-w-2xl text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                Suas automações de comentário e DM — responde e capta sozinho, no seu Instagram.
              </p>
            </div>
          </div>
          <Link
            href="/app/instagram/automacoes/novo"
            className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-semibold"
            style={{ background: "#D7F36A", color: "#14181F" }}
          >
            + Nova automação
          </Link>
        </div>
      </header>

      {/* ── KPI resumo ──────────────────────────────────────────── */}
      {!carregando && flows.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Total de flows" valor={flows.length} icone={Zap} />
          <KpiCard label="Ativos" valor={ativos} icone={CheckCircle2} cor="#4ADE80" />
          <KpiCard label="Inativos" valor={inativos} icone={PauseCircle} />
        </section>
      )}

      {/* ── Estado de carregamento ──────────────────────────────── */}
      {carregando && (
        <div className="wr-card flex items-center justify-center py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
          />
        </div>
      )}

      {/* ── Erro ────────────────────────────────────────────────── */}
      {erro && !carregando && (
        <div className="wr-card p-5" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }}>
          <p className="text-sm font-semibold" style={{ color: "#F87171" }}>{erro}</p>
          <button
            onClick={recarregar}
            className="mt-2 text-sm font-medium underline underline-offset-4"
            style={{ color: "#F87171" }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Lista vazia ─────────────────────────────────────────── */}
      {!carregando && !erro && flows.length === 0 && (
        <EmptyState
          icon={Zap}
          title="Nenhuma automação criada"
          description="Crie um flow para responder comentários automaticamente ou enviar DMs quando alguém usar uma palavra-chave."
          action={{ label: "Criar primeiro flow", href: "/app/instagram/automacoes/novo" }}
        />
      )}

      {/* ── Lista de flows ──────────────────────────────────────── */}
      {!carregando && flows.length > 0 && (
        <section className="wr-card overflow-hidden p-0">
          {flows.map((flow, i) => (
            <div
              key={flow.id}
              className="flex flex-wrap items-start gap-4 px-5 py-4 transition-colors hover:bg-[var(--color-surface-elevated)]"
              style={{ borderBottom: i < flows.length - 1 ? "1px solid var(--color-border)" : undefined }}
            >
              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{flow.nome}</span>
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={
                      flow.ativo
                        ? { background: "rgba(34,197,94,0.15)", color: "#4ADE80" }
                        : { background: "rgba(255,255,255,0.06)", color: "var(--color-text-subtle)" }
                    }
                  >
                    {flow.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {TRIGGER_LABEL[flow.trigger_tipo]}
                  {(flow.trigger_config as { keywords?: string[] }).keywords?.length
                    ? ` — "${(flow.trigger_config as { keywords: string[] }).keywords.slice(0, 2).join('", "')}"`
                    : ""}
                </p>

                {/* Ações */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {flow.acoes.map((acao, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                      style={{ background: "rgba(67,82,196,0.22)", color: "#B4BCF0" }}
                    >
                      {ACAO_LABEL[acao.tipo] ?? acao.tipo}
                    </span>
                  ))}
                </div>

                {flow.ultima_ativacao_at && (
                  <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                    Última ativação:{" "}
                    {new Date(flow.ultima_ativacao_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                )}
              </div>

              {/* Botões */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleAtivo(flow)}
                  disabled={alterandoId === flow.id}
                  className="inline-flex h-9 items-center rounded-full px-3.5 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
                >
                  {alterandoId === flow.id ? "…" : flow.ativo ? "Desativar" : "Ativar"}
                </button>
                <Link
                  href={`/app/instagram/automacoes/${flow.id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                </Link>
                <button
                  onClick={() => excluir(flow)}
                  disabled={alterandoId === flow.id}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ border: "1px solid rgba(239,68,68,0.3)", background: "var(--color-surface-elevated)", color: "#F87171" }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Info first-match ────────────────────────────────────── */}
      {flows.length > 1 && (
        <p className="text-center text-xs" style={{ color: "var(--color-text-subtle)" }}>
          Os flows são avaliados em ordem de criação. O <strong>primeiro que bater</strong> executa
          — os demais são ignorados para o mesmo comentário.
        </p>
      )}
    </div>
  );
}

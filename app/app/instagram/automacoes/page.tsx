/**
 * /app/instagram/automacoes — Lista de flows de automação (War Room 2.0)
 *
 * Lista todos os flows de automação (triggers + ações) da organização.
 * Permite criar, ativar/desativar e editar flows.
 *
 * Acesso: manager+
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

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
      await fetch(`/api/v1/ig-automation-flows/${flow.id}`, {
        method: "DELETE",
      });
      await recarregar();
    } finally {
      setAlterandoId(null);
    }
  }

  const ativos = flows.filter((f) => f.ativo).length;
  const inativos = flows.length - ativos;

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header card ─────────────────────────────────────────── */}
      <header className="wr-card p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm mb-1" style={{ color: "#5B606B" }}>
            <Link
              href="/app/instagram"
              className="hover:opacity-70 transition-colors font-medium"
            >
              Instagram
            </Link>
            <span style={{ color: "#9A9D8F" }}>/</span>
            <span className="font-medium">Automações</span>
          </div>
          <h1 className="font-heading text-[36px] font-bold leading-tight">Automações</h1>
          <p className="mt-1.5 text-base" style={{ color: "#4A4F59" }}>
            Flows de trigger + ação — primeiro que bater executa.
          </p>
        </div>
        <Link href="/app/instagram/automacoes/novo" className="wr-btn-dark">
          + Novo flow
        </Link>
      </header>

      {/* ── KPI resumo ──────────────────────────────────────────── */}
      {!carregando && flows.length > 0 && (
        <section className="flex flex-wrap gap-3">
          <div
            className="flex-1 min-w-[120px] rounded-[20px] p-4"
            style={{ background: "#FFFFFF", boxShadow: "var(--wr-card-shadow)" }}
          >
            <div className="text-[13px] font-medium" style={{ color: "#4A4F59" }}>
              Total de flows
            </div>
            <div className="font-heading text-[28px] font-bold mt-0.5 tabular-nums">
              {flows.length}
            </div>
          </div>
          <div
            className="flex-1 min-w-[120px] rounded-[20px] p-4"
            style={{ background: "#E2F5EC", boxShadow: "var(--wr-card-shadow)" }}
          >
            <div className="text-[13px] font-medium" style={{ color: "#17784F" }}>
              Ativos
            </div>
            <div
              className="font-heading text-[28px] font-bold mt-0.5 tabular-nums"
              style={{ color: "#17784F" }}
            >
              {ativos}
            </div>
          </div>
          <div
            className="flex-1 min-w-[120px] rounded-[20px] p-4"
            style={{ background: "#FFFFFF", boxShadow: "var(--wr-card-shadow)" }}
          >
            <div className="text-[13px] font-medium" style={{ color: "#5B606B" }}>
              Inativos
            </div>
            <div className="font-heading text-[28px] font-bold mt-0.5 tabular-nums">
              {inativos}
            </div>
          </div>
        </section>
      )}

      {/* ── Estado de carregamento ──────────────────────────────── */}
      {carregando && (
        <div className="wr-card flex items-center justify-center py-16">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "#4352C4", borderTopColor: "transparent" }}
          />
        </div>
      )}

      {/* ── Erro ────────────────────────────────────────────────── */}
      {erro && !carregando && (
        <div
          className="wr-card p-5"
          style={{ background: "#FBE4E2" }}
        >
          <p className="text-sm font-semibold" style={{ color: "#A3302A" }}>
            {erro}
          </p>
          <button
            onClick={recarregar}
            className="mt-2 text-sm font-medium underline underline-offset-4"
            style={{ color: "#A3302A" }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Lista vazia ─────────────────────────────────────────── */}
      {!carregando && !erro && flows.length === 0 && (
        <div className="wr-card flex flex-col items-center gap-4 py-16 text-center">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full"
            style={{ background: "#F0F0EB" }}
          >
            <span className="text-2xl">⚡</span>
          </div>
          <div>
            <p className="font-heading text-lg font-semibold" style={{ color: "#16181D" }}>
              Nenhuma automação criada
            </p>
            <p className="text-sm mt-1 max-w-xs mx-auto" style={{ color: "#5B606B" }}>
              Crie um flow para responder comentários automaticamente ou enviar DMs quando alguém
              usar uma palavra-chave.
            </p>
          </div>
          <Link href="/app/instagram/automacoes/novo" className="wr-btn-dark mt-2">
            Criar primeiro flow
          </Link>
        </div>
      )}

      {/* ── Lista de flows ──────────────────────────────────────── */}
      {!carregando && flows.length > 0 && (
        <section className="wr-card pt-2 pb-0 px-0">
          {flows.map((flow, i) => (
            <div
              key={flow.id}
              className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[#F6F6F2]"
              style={{
                borderBottom: i < flows.length - 1 ? "1px solid #F0F0EB" : undefined,
              }}
            >
              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className="font-semibold text-sm"
                    style={{ color: "#16181D" }}
                  >
                    {flow.nome}
                  </span>
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={
                      flow.ativo
                        ? { background: "#E2F5EC", color: "#17784F" }
                        : { background: "#F0F0EB", color: "#5B606B" }
                    }
                  >
                    {flow.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <p className="mt-1 text-xs" style={{ color: "#5B606B" }}>
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
                      style={{ background: "#E4E7F8", color: "#2F3DA8" }}
                    >
                      {ACAO_LABEL[acao.tipo] ?? acao.tipo}
                    </span>
                  ))}
                </div>

                {flow.ultima_ativacao_at && (
                  <p className="mt-1.5 text-[11px]" style={{ color: "#9A9D8F" }}>
                    Última ativação:{" "}
                    {new Date(flow.ultima_ativacao_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                )}
              </div>

              {/* Botões */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleAtivo(flow)}
                  disabled={alterandoId === flow.id}
                  className="inline-flex items-center h-9 px-3.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{
                    border: "1px solid #DCDCD5",
                    background: "#FFFFFF",
                    color: "#4A4F59",
                  }}
                >
                  {alterandoId === flow.id ? "…" : flow.ativo ? "Desativar" : "Ativar"}
                </button>
                <Link
                  href={`/app/instagram/automacoes/${flow.id}`}
                  className="inline-flex items-center h-9 px-3.5 rounded-full text-xs font-semibold transition-colors"
                  style={{
                    border: "1px solid #DCDCD5",
                    background: "#FFFFFF",
                    color: "#4A4F59",
                  }}
                >
                  Editar
                </Link>
                <button
                  onClick={() => excluir(flow)}
                  disabled={alterandoId === flow.id}
                  className="inline-flex items-center h-9 px-3.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{
                    border: "1px solid #FBE4E2",
                    background: "#FFFFFF",
                    color: "#A3302A",
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Info first-match ────────────────────────────────────── */}
      {flows.length > 1 && (
        <p className="text-xs text-center" style={{ color: "#9A9D8F" }}>
          Os flows são avaliados em ordem de criação. O <strong>primeiro que bater</strong> executa
          — os demais são ignorados para o mesmo comentário.
        </p>
      )}
    </div>
  );
}

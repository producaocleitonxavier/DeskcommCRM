/**
 * /app/instagram/webhooks — Tokens de webhook do Instagram Graph API (War Room 2.0)
 *
 * Permite ao manager gerar e gerenciar tokens de URL para configurar o
 * webhook do Instagram Business no App Meta. Cada token mapeia para uma
 * organização + channel_session.
 *
 * URL de webhook resultante: https://<domínio>/api/v1/webhooks/instagram-comments/<token>
 *
 * Acesso: manager+
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface WebhookToken {
  id: string;
  path_token: string;
  descricao: string | null;
  ativo: boolean;
  ultimo_ping_at: string | null;
  created_at: string;
}

// ── Hook de dados ──────────────────────────────────────────────────────────────

function useTokens() {
  const [tokens, setTokens] = useState<WebhookToken[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/v1/ig-webhook-tokens");
      if (!res.ok) throw new Error("Erro ao carregar tokens");
      const json = await res.json();
      setTokens(json.data?.tokens ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { tokens, carregando, erro, recarregar: carregar };
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function WebhooksInstagramPage() {
  const { tokens, carregando, erro, recarregar } = useTokens();
  const [copiado, setCopiado] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [descricaoNova, setDescricaoNova] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const urlBase =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/v1/webhooks/instagram-comments`
      : "https://seu-dominio.com/api/v1/webhooks/instagram-comments";

  async function copiar(token: string) {
    const url = `${urlBase}/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(token);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      const el = document.getElementById(`token-${token}`);
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  }

  async function criarToken() {
    setCriando(true);
    try {
      const res = await fetch("/api/v1/ig-webhook-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: descricaoNova || null }),
      });
      if (!res.ok) throw new Error("Erro ao criar token");
      setDescricaoNova("");
      setMostrarFormulario(false);
      await recarregar();
    } finally {
      setCriando(false);
    }
  }

  async function revogar(id: string) {
    if (!confirm("Revogar este token? O webhook do Meta vai parar de funcionar.")) return;
    await fetch(`/api/v1/ig-webhook-tokens/${id}`, { method: "DELETE" });
    await recarregar();
  }

  const ativos = tokens.filter((t) => t.ativo).length;

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
            <span className="font-medium">Tokens de Webhook</span>
          </div>
          <h1 className="font-heading text-[36px] font-bold leading-tight">
            Tokens de Webhook
          </h1>
          <p className="mt-1.5 text-base" style={{ color: "#4A4F59" }}>
            Configure o Instagram Business para entregar eventos aqui via Graph API.
          </p>
        </div>
        <button
          onClick={() => setMostrarFormulario(true)}
          className="wr-btn-dark"
        >
          + Novo token
        </button>
      </header>

      {/* ── KPI resumo ──────────────────────────────────────────── */}
      {!carregando && tokens.length > 0 && (
        <section className="flex flex-wrap gap-3">
          <div
            className="flex-1 min-w-[120px] rounded-[20px] p-4"
            style={{ background: "#FFFFFF", boxShadow: "var(--wr-card-shadow)" }}
          >
            <div className="text-[13px] font-medium" style={{ color: "#4A4F59" }}>
              Total de tokens
            </div>
            <div className="font-heading text-[28px] font-bold mt-0.5 tabular-nums">
              {tokens.length}
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
              {tokens.length - ativos}
            </div>
          </div>
        </section>
      )}

      {/* ── Formulário de criação ──────────────────────────────── */}
      {mostrarFormulario && (
        <div className="wr-card p-5 space-y-4">
          <h2
            className="font-heading text-lg font-bold"
            style={{ color: "#16181D" }}
          >
            Gerar novo token
          </h2>
          <input
            type="text"
            placeholder="Descrição (ex: Conta @meupolitico)"
            value={descricaoNova}
            onChange={(e) => setDescricaoNova(e.target.value)}
            className="w-full rounded-full border px-4 py-2.5 text-sm focus:outline-none focus:ring-2"
            style={{
              borderColor: "#DCDCD5",
              background: "#FFFFFF",
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={criarToken}
              disabled={criando}
              className="wr-btn-dark disabled:opacity-50"
            >
              {criando ? "Gerando…" : "Gerar token"}
            </button>
            <button
              onClick={() => setMostrarFormulario(false)}
              className="inline-flex items-center h-[44px] px-5 rounded-full text-sm font-semibold transition-colors"
              style={{
                border: "1px solid #DCDCD5",
                background: "#FFFFFF",
                color: "#4A4F59",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Instrução de configuração ──────────────────────────── */}
      <div
        className="wr-card p-5 space-y-2"
        style={{ background: "#F0F0EB" }}
      >
        <p
          className="text-sm font-semibold"
          style={{ color: "#16181D" }}
        >
          Como configurar no Meta
        </p>
        <ol
          className="list-decimal list-inside space-y-1 text-sm"
          style={{ color: "#4A4F59" }}
        >
          <li>Gere um token abaixo e copie a URL completa</li>
          <li>
            No{" "}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-4"
              style={{ color: "#4352C4" }}
            >
              Meta for Developers
            </a>
            , vá em seu App → Instagram → Webhooks
          </li>
          <li>Cole a URL como Callback URL e use qualquer string como Verify Token</li>
          <li>
            Assine os campos:{" "}
            <code
              className="rounded-md px-1.5 py-0.5 text-xs font-mono"
              style={{ background: "#FFFFFF" }}
            >
              comments
            </code>{" "}
            e{" "}
            <code
              className="rounded-md px-1.5 py-0.5 text-xs font-mono"
              style={{ background: "#FFFFFF" }}
            >
              mentions
            </code>
          </li>
        </ol>
      </div>

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
        <div className="wr-card p-5" style={{ background: "#FBE4E2" }}>
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
      {!carregando && !erro && tokens.length === 0 && (
        <div className="wr-card flex flex-col items-center gap-4 py-16 text-center">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full"
            style={{ background: "#F0F0EB" }}
          >
            <span className="text-2xl">🔗</span>
          </div>
          <div>
            <p
              className="font-heading text-lg font-semibold"
              style={{ color: "#16181D" }}
            >
              Nenhum token gerado ainda
            </p>
            <p className="text-sm mt-1 max-w-xs mx-auto" style={{ color: "#5B606B" }}>
              Gere um token para começar a receber comentários do Instagram.
            </p>
          </div>
          <button
            onClick={() => setMostrarFormulario(true)}
            className="wr-btn-dark mt-2"
          >
            Gerar primeiro token
          </button>
        </div>
      )}

      {/* ── Lista de tokens ─────────────────────────────────────── */}
      {!carregando && tokens.length > 0 && (
        <section className="wr-card pt-2 pb-0 px-0">
          {tokens.map((token, i) => {
            const url = `${urlBase}/${token.path_token}`;
            return (
              <div
                key={token.id}
                className="px-5 py-4 space-y-3"
                style={{
                  borderBottom:
                    i < tokens.length - 1 ? "1px solid #F0F0EB" : undefined,
                }}
              >
                {/* Cabeçalho do token */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        background: token.ativo ? "#17784F" : "#9A9D8F",
                      }}
                    />
                    <span
                      className="font-semibold text-sm"
                      style={{ color: "#16181D" }}
                    >
                      {token.descricao ?? "Sem descrição"}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={
                        token.ativo
                          ? { background: "#E2F5EC", color: "#17784F" }
                          : { background: "#F0F0EB", color: "#5B606B" }
                      }
                    >
                      {token.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => copiar(token.path_token)}
                      className="inline-flex items-center h-9 px-3.5 rounded-full text-xs font-semibold transition-colors"
                      style={{
                        border: "1px solid #DCDCD5",
                        background: "#FFFFFF",
                        color: copiado === token.path_token ? "#17784F" : "#4A4F59",
                      }}
                    >
                      {copiado === token.path_token ? "✓ Copiado!" : "Copiar URL"}
                    </button>
                    <button
                      onClick={() => revogar(token.id)}
                      className="inline-flex items-center h-9 px-3.5 rounded-full text-xs font-semibold transition-colors"
                      style={{
                        border: "1px solid #FBE4E2",
                        background: "#FFFFFF",
                        color: "#A3302A",
                      }}
                    >
                      Revogar
                    </button>
                  </div>
                </div>

                {/* URL */}
                <div
                  className="flex items-center gap-2 rounded-[12px] px-3.5 py-2.5"
                  style={{ background: "#F0F0EB" }}
                >
                  <code
                    id={`token-${token.path_token}`}
                    className="flex-1 min-w-0 truncate text-xs select-all font-mono"
                    style={{ color: "#4A4F59" }}
                  >
                    {url}
                  </code>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-[11px]" style={{ color: "#9A9D8F" }}>
                  <span>
                    Criado em{" "}
                    {new Date(token.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  {token.ultimo_ping_at && (
                    <span>
                      Último ping:{" "}
                      {new Date(token.ultimo_ping_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

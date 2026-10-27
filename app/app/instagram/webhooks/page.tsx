/**
 * /app/instagram/webhooks — Tokens de webhook do Instagram Graph API (War Room 2.0)
 *
 * Gera e gerencia tokens de URL para configurar o webhook do Instagram Business
 * no App Meta. Acesso: admin (gate no layout). Visual: padrão War Room dark.
 *
 * URL resultante: https://<domínio>/api/v1/webhooks/instagram-comments/<token>
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { Link2, CheckCircle2, PauseCircle } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { KpiCard } from "@/components/politico/kpi-card";
import { EmptyState } from "@/components/politico/empty-state";

export const dynamic = "force-dynamic";

interface WebhookToken {
  id: string;
  path_token: string;
  verify_token: string | null;
  descricao: string | null;
  ativo: boolean;
  ultimo_ping_at: string | null;
  created_at: string;
}

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

const BTN_SECUNDARIO: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-elevated)",
  color: "var(--color-text-muted)",
};
const BOX_CODE: React.CSSProperties = { background: "var(--color-surface-elevated)" };

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
    <div className="mx-auto max-w-[1140px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Instagram · Webhooks"
        titulo="Tokens de Webhook"
        subtitulo="Configure o Instagram Business para entregar eventos aqui via Graph API."
        extra={
          <button
            onClick={() => setMostrarFormulario(true)}
            className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-semibold"
            style={{ background: "#D7F36A", color: "#14181F" }}
          >
            + Novo token
          </button>
        }
      />

      {/* ── KPI resumo ──────────────────────────────────────────── */}
      {!carregando && tokens.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Total de tokens" valor={tokens.length} icone={Link2} />
          <KpiCard label="Ativos" valor={ativos} icone={CheckCircle2} cor="#4ADE80" />
          <KpiCard label="Inativos" valor={tokens.length - ativos} icone={PauseCircle} />
        </section>
      )}

      {/* ── Formulário de criação ──────────────────────────────── */}
      {mostrarFormulario && (
        <div className="wr-card space-y-4 p-5">
          <h2 className="font-heading text-lg font-bold" style={{ color: "var(--color-text)" }}>Gerar novo token</h2>
          <input
            type="text"
            placeholder="Descrição (ex: Conta @meupolitico)"
            value={descricaoNova}
            onChange={(e) => setDescricaoNova(e.target.value)}
            className="wr-input w-full"
          />
          <div className="flex gap-2">
            <button onClick={criarToken} disabled={criando} className="wr-btn-dark disabled:opacity-50">
              {criando ? "Gerando…" : "Gerar token"}
            </button>
            <button
              onClick={() => setMostrarFormulario(false)}
              className="inline-flex h-[44px] items-center rounded-full px-5 text-sm font-semibold transition-colors"
              style={BTN_SECUNDARIO}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Instrução de configuração ──────────────────────────── */}
      <div className="wr-card space-y-2 p-5" style={{ background: "var(--color-surface)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Como configurar no Meta</p>
        <ol className="list-inside list-decimal space-y-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <li>Gere um token abaixo e copie a URL completa</li>
          <li>
            No{" "}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4" style={{ color: "var(--color-accent)" }}>
              Meta for Developers
            </a>
            , vá em seu App → Instagram → Webhooks
          </li>
          <li>Cole a URL como <strong>Callback URL</strong> e o <strong>Verify Token</strong> abaixo (copie o do token). Objeto <strong>Instagram</strong> — não &quot;User&quot;.</li>
          <li>
            Assine os campos:{" "}
            <code className="rounded-md px-1.5 py-0.5 font-mono text-xs" style={BOX_CODE}>comments</code>{" "}
            e{" "}
            <code className="rounded-md px-1.5 py-0.5 font-mono text-xs" style={BOX_CODE}>mentions</code>
          </li>
        </ol>
      </div>

      {/* ── Estado de carregamento ──────────────────────────────── */}
      {carregando && (
        <div className="wr-card flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
        </div>
      )}

      {/* ── Erro ────────────────────────────────────────────────── */}
      {erro && !carregando && (
        <div className="wr-card p-5" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }}>
          <p className="text-sm font-semibold" style={{ color: "#F87171" }}>{erro}</p>
          <button onClick={recarregar} className="mt-2 text-sm font-medium underline underline-offset-4" style={{ color: "#F87171" }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Lista vazia ─────────────────────────────────────────── */}
      {!carregando && !erro && tokens.length === 0 && (
        <div className="wr-card">
          <EmptyState
            icon={Link2}
            title="Nenhum token gerado ainda"
            description="Gere um token para começar a receber comentários do Instagram."
          />
        </div>
      )}

      {/* ── Lista de tokens ─────────────────────────────────────── */}
      {!carregando && tokens.length > 0 && (
        <section className="wr-card overflow-hidden p-0">
          {tokens.map((token, i) => {
            const url = `${urlBase}/${token.path_token}`;
            return (
              <div
                key={token.id}
                className="space-y-3 px-5 py-4"
                style={{ borderBottom: i < tokens.length - 1 ? "1px solid var(--color-border)" : undefined }}
              >
                {/* Cabeçalho do token */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: token.ativo ? "#4ADE80" : "var(--color-text-subtle)" }} />
                    <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{token.descricao ?? "Sem descrição"}</span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={token.ativo ? { background: "rgba(34,197,94,0.15)", color: "#4ADE80" } : { background: "rgba(255,255,255,0.06)", color: "var(--color-text-subtle)" }}
                    >
                      {token.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => copiar(token.path_token)}
                      className="inline-flex h-9 items-center rounded-full px-3.5 text-xs font-semibold transition-colors"
                      style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)", color: copiado === token.path_token ? "#4ADE80" : "var(--color-text-muted)" }}
                    >
                      {copiado === token.path_token ? "✓ Copiado!" : "Copiar URL"}
                    </button>
                    <button
                      onClick={() => revogar(token.id)}
                      className="inline-flex h-9 items-center rounded-full px-3.5 text-xs font-semibold transition-colors"
                      style={{ border: "1px solid rgba(239,68,68,0.3)", background: "var(--color-surface-elevated)", color: "#F87171" }}
                    >
                      Revogar
                    </button>
                  </div>
                </div>

                {/* URL */}
                <div className="flex items-center gap-2 rounded-[12px] px-3.5 py-2.5" style={BOX_CODE}>
                  <code id={`token-${token.path_token}`} className="min-w-0 flex-1 select-all truncate font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {url}
                  </code>
                </div>

                {/* Verify Token */}
                {token.verify_token && (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold" style={{ color: "var(--color-text-subtle)" }}>
                      Verify Token — cole no Meta (objeto Instagram)
                    </div>
                    <div className="flex items-center gap-2 rounded-[12px] px-3.5 py-2.5" style={BOX_CODE}>
                      <code className="min-w-0 flex-1 select-all truncate font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {token.verify_token}
                      </code>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard?.writeText(token.verify_token!).catch(() => {}); }}
                        className="inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[11px] font-semibold"
                        style={BTN_SECUNDARIO}
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                  <span>Criado em {new Date(token.created_at).toLocaleDateString("pt-BR")}</span>
                  {token.ultimo_ping_at && (
                    <span>
                      Último ping:{" "}
                      {new Date(token.ultimo_ping_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
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

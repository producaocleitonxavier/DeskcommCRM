/**
 * /app/instagram/conectar — Conectar conta Instagram Business (War Room 2.0)
 *
 * Página onde o administrador conecta uma conta Instagram Business via OAuth
 * do Facebook. Mostra o status da conexão atual e permite reconectar.
 *
 * Acesso: admin+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface SessaoInstagram {
  id: string;
  ig_business_account_id: string;
  ig_page_id: string | null;
  display_name: string | null;
  status: string;
  ig_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function buscarSessao(organizationId: string): Promise<SessaoInstagram | null> {
  const db = await createClient();
  const { data } = await db
    .from("channel_sessions")
    .select(
      "id, ig_business_account_id, ig_page_id, display_name, status, ig_token_expires_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("provider", "instagram")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as SessaoInstagram | null) ?? null;
}

// ── Helpers de UI ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; color: string; text: string }> = {
    // status real segue o vocabulário do WAHA (channel_sessions compartilhada)
    WORKING: { bg: "#D7F36A", color: "#2E3410", text: "Conectado" },
    STOPPED: { bg: "#FEE2E2", color: "#991B1B", text: "Desconectado" },
    FAILED: { bg: "#FEE2E2", color: "#991B1B", text: "Falha" },
    STARTING: { bg: "#FEF3C7", color: "#92400E", text: "Conectando" },
    // sintético (calculado pela expiração do token) / compat
    expired: { bg: "#FEF3C7", color: "#92400E", text: "Token expirado" },
    connected: { bg: "#D7F36A", color: "#2E3410", text: "Conectado" },
  };
  const c = configs[status] ?? { bg: "#E5E7EB", color: "#374151", text: status };
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: c.bg, color: c.color }}
    >
      {c.text}
    </span>
  );
}

function diasAteExpirar(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── Erros de OAuth ──────────────────────────────────────────────────────────

const MENSAGENS_ERRO: Record<string, string> = {
  not_configured:
    "As variáveis IG_APP_ID e IG_APP_SECRET (ou META_APP_ID/META_APP_SECRET) não estão configuradas no servidor.",
  unauthorized: "Você precisa ser administrador para conectar o Instagram.",
  invalid_state: "A sessão de autorização expirou. Tente novamente.",
  missing_code: "Autorização cancelada no Facebook.",
  user_denied: "Você cancelou a autorização no Facebook.",
  code_exchange_failed: "Falha ao trocar o código de autorização. Tente novamente.",
  long_lived_exchange_failed: "Falha ao gerar o token de longa duração. Tente novamente.",
  no_ig_business_account:
    "Nenhuma conta Instagram Business encontrada. Sua página do Facebook precisa ter uma conta Instagram Business vinculada.",
  encryption_failed: "Falha ao cifrar o token. Verifique a configuração do servidor.",
  save_failed: "Falha ao salvar a conexão. Tente novamente.",
};

// ── Componente principal ─────────────────────────────────────────────────────

export default async function ConectarInstagramPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const sessao = await buscarSessao(org.orgId);

  const sucesso = params.ok === "1";
  const accountName = typeof params.account === "string" ? decodeURIComponent(params.account) : null;
  const errorCode = typeof params.error === "string" ? params.error : null;
  const mensagemErro = errorCode ? (MENSAGENS_ERRO[errorCode] ?? `Erro: ${errorCode}`) : null;

  const dias = sessao ? diasAteExpirar(sessao.ig_token_expires_at) : null;
  const tokenProximo = dias !== null && dias <= 7;

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="wr-card p-6 sm:p-7">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/app/instagram"
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "#4352C4" }}
          >
            ← Instagram
          </Link>
        </div>
        <h1 className="font-heading text-[32px] font-bold leading-tight">
          Conectar Instagram Business
        </h1>
        <p className="mt-1.5 text-base" style={{ color: "#4A4F59" }}>
          Vincule sua conta Instagram Business via Facebook para enviar DMs e responder comentários
          automaticamente.
        </p>
      </header>

      {/* ── Feedback de sucesso ─────────────────────────────────── */}
      {sucesso && (
        <div
          className="wr-card p-5 flex items-start gap-3"
          style={{ background: "#F0FDF4", borderLeft: "4px solid #22C55E" }}
        >
          <span className="text-lg">✓</span>
          <div>
            <p className="font-semibold" style={{ color: "#15803D" }}>
              Instagram conectado com sucesso!
            </p>
            {accountName && (
              <p className="text-sm mt-0.5" style={{ color: "#166534" }}>
                Conta: {accountName}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Feedback de erro ───────────────────────────────────── */}
      {mensagemErro && (
        <div
          className="wr-card p-5 flex items-start gap-3"
          style={{ background: "#FEF2F2", borderLeft: "4px solid #EF4444" }}
        >
          <span className="text-lg">!</span>
          <div>
            <p className="font-semibold" style={{ color: "#991B1B" }}>
              Falha na conexão
            </p>
            <p className="text-sm mt-0.5" style={{ color: "#7F1D1D" }}>
              {mensagemErro}
            </p>
          </div>
        </div>
      )}

      {/* ── Status atual ───────────────────────────────────────── */}
      {sessao && (
        <section className="wr-card p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-heading text-[20px] font-bold">Conta conectada</h2>
            <StatusBadge status={tokenProximo ? "expired" : sessao.status} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                Conta
              </div>
              <div className="mt-1 text-sm font-medium">
                {sessao.display_name ?? sessao.ig_business_account_id}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                Business Account ID
              </div>
              <div className="mt-1 text-sm font-mono">{sessao.ig_business_account_id}</div>
            </div>
            {sessao.ig_page_id && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                  Page ID
                </div>
                <div className="mt-1 text-sm font-mono">{sessao.ig_page_id}</div>
              </div>
            )}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "#9CA3AF" }}>
                Token expira em
              </div>
              <div className="mt-1 text-sm">
                {dias !== null ? (
                  <span style={{ color: tokenProximo ? "#DC2626" : "#16A34A", fontWeight: 600 }}>
                    {dias} dia{dias !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span style={{ color: "#9CA3AF" }}>—</span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Botão de conexão ───────────────────────────────────── */}
      <section className="wr-card p-6 space-y-4">
        <h2 className="font-heading text-[20px] font-bold">
          {sessao ? "Reconectar" : "Conectar agora"}
        </h2>
        <p className="text-sm" style={{ color: "#5B606B" }}>
          {sessao
            ? "Reconecte para renovar o token ou trocar de conta. O token atual será substituído."
            : "Conecte sua conta Instagram Business para habilitar automações de comentários e DMs."}
        </p>

        <div className="space-y-3">
          <a
            href="/api/v1/ig-oauth/authorize"
            className="inline-flex items-center justify-center gap-2 rounded-[14px] px-6 py-3 text-[15px] font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "#16181D", color: "#FFFFFF" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            {sessao ? "Reconectar Instagram" : "Conectar Instagram Business"}
          </a>
        </div>

        {/* ── Requisitos ───────────────────────────────────────── */}
        <div className="pt-3 border-t" style={{ borderColor: "#E5E7EB" }}>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#9CA3AF" }}>
            Pré-requisitos
          </h3>
          <ul className="text-sm space-y-1.5" style={{ color: "#5B606B" }}>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-xs">●</span>
              Conta Instagram Business ou Creator (não pessoal)
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-xs">●</span>
              Login direto pelo Instagram — não precisa de Página do Facebook
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-xs">●</span>
              Enquanto o app estiver em desenvolvimento, você precisa ser admin ou testador dele
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-xs">●</span>
              App do Instagram configurado no servidor (IG_APP_ID e IG_APP_SECRET)
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

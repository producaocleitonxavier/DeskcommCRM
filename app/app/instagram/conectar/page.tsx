/**
 * /app/instagram/conectar — Conectar conta Instagram (War Room 2.0)
 *
 * Conecta uma conta Instagram Business/Creator via OAuth (Instagram Login) e
 * mostra o status com os números REAIS da conta (seguidores, posts, engajamento).
 *
 * Acesso: admin+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { lerPerfilInstagram, type PerfilProprio } from "@/lib/channels/instagram/perfil";

export const dynamic = "force-dynamic";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface SessaoInstagram {
  id: string;
  ig_business_account_id: string;
  display_name: string | null;
  status: string;
  ig_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const IG_GRADIENT = "linear-gradient(135deg, #833AB4 0%, #FD1D1D 55%, #FCB045 100%)";

// ── Data fetching ────────────────────────────────────────────────────────────

async function buscarSessao(organizationId: string): Promise<SessaoInstagram | null> {
  const db = await createClient();
  const { data } = await db
    .from("channel_sessions")
    .select(
      "id, ig_business_account_id, display_name, status, ig_token_expires_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("provider", "instagram")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as SessaoInstagram | null) ?? null;
}

function diasAteExpirar(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function nf(n: number): string {
  return n.toLocaleString("pt-BR");
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

// ── Erros de OAuth ──────────────────────────────────────────────────────────

const MENSAGENS_ERRO: Record<string, string> = {
  not_configured: "As variáveis IG_APP_ID/IG_APP_SECRET não estão configuradas no servidor.",
  unauthorized: "Você precisa ser administrador para conectar o Instagram.",
  invalid_state: "A sessão de autorização expirou. Tente novamente.",
  missing_code: "Autorização cancelada no Instagram.",
  user_denied: "Você cancelou a autorização no Instagram.",
  code_exchange_failed: "Falha ao trocar o código de autorização. Tente novamente.",
  long_lived_exchange_failed: "Falha ao gerar o token de longa duração. Tente novamente.",
  no_ig_business_account:
    "Nenhuma conta Instagram Business/Creator encontrada. Use uma conta Profissional.",
  encryption_failed: "Falha ao cifrar o token. Verifique a configuração do servidor.",
  save_failed: "Falha ao salvar a conexão. Tente novamente.",
};

// ── Sub-componentes ──────────────────────────────────────────────────────────

function Stat({ label, valor, sub, destaque }: { label: string; valor: string; sub?: string; destaque?: boolean }) {
  return (
    <div className="flex-1 min-w-[110px]">
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
        {label}
      </div>
      <div
        className="font-heading font-bold mt-1 tabular-nums leading-none"
        style={{ fontSize: destaque ? "32px" : "24px", color: destaque ? "var(--color-accent)" : "var(--color-text)" }}
      >
        {valor}
      </div>
      {sub && <div className="text-[11px] mt-1" style={{ color: "var(--color-text-subtle)" }}>{sub}</div>}
    </div>
  );
}

function UnlockCard({ titulo, desc, estado }: { titulo: string; desc: string; estado: "ativo" | "a ativar" }) {
  const ativo = estado === "ativo";
  return (
    <div className="wr-card-dark p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-heading text-[15px] font-bold" style={{ color: "var(--color-text)" }}>{titulo}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={
            ativo
              ? { background: "var(--color-accent)", color: "#1B2206" }
              : { background: "color-mix(in srgb, var(--color-text-subtle) 22%, transparent)", color: "var(--color-text-muted)" }
          }
        >
          {ativo ? "ativo" : "a ativar"}
        </span>
      </div>
      <p className="text-xs leading-snug" style={{ color: "var(--color-text-muted)" }}>{desc}</p>
    </div>
  );
}

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
  const conectado = sessao !== null && sessao.status === "WORKING";

  const perfil: PerfilProprio | null = conectado ? await lerPerfilInstagram(org.orgId) : null;

  const sucesso = params.ok === "1";
  const errorCode = typeof params.error === "string" ? params.error : null;
  const mensagemErro = errorCode ? (MENSAGENS_ERRO[errorCode] ?? `Erro: ${errorCode}`) : null;

  const dias = sessao ? diasAteExpirar(sessao.ig_token_expires_at) : null;
  const tokenProximo = dias !== null && dias <= 7;
  const nomeConta = perfil?.username ?? sessao?.display_name?.replace(/^Instagram @/, "") ?? sessao?.ig_business_account_id ?? "";

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-5">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <header>
        <Link href="/app/instagram" className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
          ← Instagram
        </Link>
        <div className="flex items-center gap-3.5 mt-3">
          <span
            className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] shrink-0"
            style={{ background: IG_GRADIENT, color: "#fff" }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
          </span>
          <div>
            <h1 className="font-heading text-[30px] font-bold leading-tight" style={{ color: "var(--color-text)" }}>
              Conectar Instagram
            </h1>
            <p className="text-[15px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Comentários, DMs e captação de leads — direto do seu perfil.
            </p>
          </div>
        </div>
      </header>

      {/* ── Feedback ────────────────────────────────────────────── */}
      {sucesso && (
        <div className="wr-card-dark p-4 flex items-center gap-3" style={{ borderColor: "color-mix(in srgb, var(--color-accent) 50%, var(--color-border))" }}>
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0" style={{ background: "var(--color-accent)", color: "#1B2206" }}>✓</span>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Instagram conectado com sucesso!</p>
        </div>
      )}
      {mensagemErro && (
        <div className="wr-card-dark p-4 flex items-start gap-3" style={{ borderColor: "color-mix(in srgb, #EF4444 50%, var(--color-border))" }}>
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-sm font-bold" style={{ background: "#EF4444", color: "#fff" }}>!</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Falha na conexão</p>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>{mensagemErro}</p>
          </div>
        </div>
      )}

      {conectado ? (
        <>
          {/* ── Card da conta conectada (impactante) ──────────────── */}
          <section
            className="rounded-[22px] p-6 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #1a1d25 0%, #12141a 100%)",
              border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
              boxShadow: "0 0 60px rgba(215, 243, 106, 0.07)",
            }}
          >
            {/* brilho decorativo */}
            <div
              className="absolute -top-24 -right-16 w-64 h-64 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(215,243,106,0.10), transparent 70%)" }}
            />
            <div className="relative flex flex-wrap items-center gap-5">
              <span
                className="inline-flex items-center justify-center w-[76px] h-[76px] rounded-full overflow-hidden shrink-0"
                style={{ background: IG_GRADIENT, padding: "3px" }}
              >
                <span className="w-full h-full rounded-full overflow-hidden flex items-center justify-center" style={{ background: "#12141a" }}>
                  {perfil?.fotoPerfil ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={perfil.fotoPerfil} alt={nomeConta} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold" style={{ color: "var(--color-accent)" }}>{nomeConta.slice(0, 1).toUpperCase()}</span>
                  )}
                </span>
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-heading text-[22px] font-bold leading-tight" style={{ color: "#F3F4EC" }}>@{nomeConta}</h2>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold"
                    style={{ background: "color-mix(in srgb, var(--color-accent) 18%, transparent)", color: "var(--color-accent)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
                    Conectado
                  </span>
                </div>
                {perfil?.nome && <p className="text-sm mt-0.5" style={{ color: "#B9BCC6" }}>{perfil.nome}</p>}
              </div>

              <Link
                href="/app/instagram/performance"
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold whitespace-nowrap transition-transform hover:scale-[1.03]"
                style={{ background: "var(--color-accent)", color: "#1B2206" }}
              >
                Minha Performance →
              </Link>
            </div>

            {/* números reais */}
            {perfil && (
              <div className="relative mt-5 pt-5 flex flex-wrap gap-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <Stat label="Seguidores" valor={compact(perfil.seguidores)} sub={nf(perfil.seguidores)} destaque />
                <Stat label="Posts" valor={nf(perfil.posts)} />
                <Stat label="Engajamento" valor={`${perfil.engajamento.toLocaleString("pt-BR")}%`} sub="por post" />
                <Stat
                  label="Token"
                  valor={dias !== null ? `${dias}d` : "—"}
                  sub={tokenProximo ? "renovar em breve" : "renova sozinho"}
                />
              </div>
            )}
          </section>

          {/* ── O que a conexão destrava ──────────────────────────── */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: "var(--color-text-subtle)" }}>
              O que seu Instagram alimenta
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <UnlockCard titulo="Opinião Pública" desc="Comentários viram escuta e sentimento, dentro da Inteligência." estado="a ativar" />
              <UnlockCard titulo="Resposta automática" desc="Responder comentários e DMs no automático — o seu ManyChat." estado="a ativar" />
              <UnlockCard titulo="Captação no funil" desc="Quem chega por DM ou começa a seguir entra no seu Kanban de leads." estado="a ativar" />
            </div>
            <p className="text-xs mt-2.5" style={{ color: "var(--color-text-subtle)" }}>
              A conta já está conectada. Esses três motores dependem de ativar o webhook de eventos — próximo passo.
            </p>
          </section>

          {/* ── Reconectar (slim) ─────────────────────────────────── */}
          <section className="wr-card-dark p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Precisa renovar o token ou trocar de conta? O token atual será substituído.
            </p>
            <a
              href="/api/v1/ig-oauth/authorize"
              className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors"
              style={{ background: "var(--color-surface-elevated)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Reconectar Instagram
            </a>
          </section>
        </>
      ) : (
        /* ── Estado não conectado: CTA forte ─────────────────────── */
        <>
          <section
            className="rounded-[22px] p-7 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #1a1d25 0%, #12141a 100%)",
              border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
              boxShadow: "0 0 60px rgba(215, 243, 106, 0.07)",
            }}
          >
            <div className="absolute -top-20 -right-12 w-56 h-56 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(215,243,106,0.10), transparent 70%)" }} />
            <div className="relative max-w-xl">
              <h2 className="font-heading text-[24px] font-bold" style={{ color: "#F3F4EC" }}>
                Transforme seu Instagram em máquina de captação
              </h2>
              <p className="text-[15px] mt-2" style={{ color: "#B9BCC6" }}>
                Conecte uma vez e habilite escuta de comentários, resposta automática por comentário e
                DM, e captura de leads no funil. Leva menos de 1 minuto.
              </p>
              <a
                href="/api/v1/ig-oauth/authorize"
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-bold mt-5 transition-transform hover:scale-[1.03]"
                style={{ background: "var(--color-accent)", color: "#1B2206" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                Conectar Instagram Business
              </a>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <UnlockCard titulo="Opinião Pública" desc="Comentários viram escuta e sentimento na Inteligência." estado="a ativar" />
            <UnlockCard titulo="Resposta automática" desc="Comentários e DMs no automático — o seu ManyChat." estado="a ativar" />
            <UnlockCard titulo="Captação no funil" desc="Quem chega por DM vira lead no seu Kanban." estado="a ativar" />
          </section>
        </>
      )}

      {/* ── Pré-requisitos (discreto) ───────────────────────────── */}
      <details className="wr-card-dark p-4">
        <summary className="text-sm font-semibold cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
          Pré-requisitos da conexão
        </summary>
        <ul className="text-sm space-y-1.5 mt-3" style={{ color: "var(--color-text-subtle)" }}>
          {[
            "Conta Instagram Business ou Creator (não pessoal)",
            "Login direto pelo Instagram — não precisa de Página do Facebook",
            "Enquanto o app estiver em desenvolvimento, você precisa ser admin ou testador dele",
            "App do Instagram configurado no servidor (IG_APP_ID e IG_APP_SECRET)",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <span className="mt-0.5 text-xs" style={{ color: "var(--color-accent)" }}>●</span>
              {t}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

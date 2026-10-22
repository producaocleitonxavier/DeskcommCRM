/**
 * /app/instagram/performance — Minha Performance (conta própria do Instagram)
 *
 * Lê a conta Instagram conectada da org (seguidores, posts, engajamento e
 * mídias recentes) via graph.instagram.com. Dados oficiais e gratuitos.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { lerPerfilInstagram, type PerfilProprio } from "@/lib/channels/instagram/perfil";

export const dynamic = "force-dynamic";

function nf(n: number): string {
  return n.toLocaleString("pt-BR");
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

const TIPO_CONTA: Record<string, string> = {
  MEDIA_CREATOR: "Creator",
  BUSINESS: "Business",
  PERSONAL: "Pessoal",
};

function dataCurta(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="wr-card-dark flex-1 min-w-[150px] p-4">
      <div className="text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
        {label}
      </div>
      <div
        className="font-heading text-[30px] font-bold mt-1 tabular-nums leading-none"
        style={{ color: "var(--color-accent)" }}
      >
        {valor}
      </div>
      {sub && (
        <div className="text-[12px] mt-1" style={{ color: "var(--color-text-subtle)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function PostCard({ m }: { m: PerfilProprio["midias"][number] }) {
  const eng = m.likes + m.comentarios;
  const legenda = (m.legenda ?? "").replace(/\s+/g, " ").trim();
  const inner = (
    <div className="wr-card-dark overflow-hidden flex flex-col h-full">
      <div
        className="relative w-full"
        style={{ aspectRatio: "1 / 1", background: "var(--color-surface-elevated)" }}
      >
        {m.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.thumb}
            alt={legenda ? legenda.slice(0, 60) : "Post do Instagram"}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "var(--color-text-subtle)" }}>
            sem prévia
          </div>
        )}
        {m.tipo && m.tipo !== "IMAGE" && (
          <span
            className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          >
            {m.tipo === "VIDEO" ? "Reel/Vídeo" : m.tipo === "CAROUSEL_ALBUM" ? "Carrossel" : m.tipo}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--color-text)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#ff6b81" }}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {nf(m.likes)}
          </span>
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--color-text)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-accent)" }}>
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {nf(m.comentarios)}
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{dataCurta(m.timestamp)}</span>
        </div>
        {legenda && (
          <p className="text-xs leading-snug line-clamp-2" style={{ color: "var(--color-text-muted)" }}>
            {legenda.slice(0, 110)}{legenda.length > 110 ? "…" : ""}
          </p>
        )}
        <div className="mt-auto pt-1 text-[11px] font-semibold" style={{ color: "var(--color-text-subtle)" }}>
          {nf(eng)} engajamentos
        </div>
      </div>
    </div>
  );
  return m.permalink ? (
    <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="block h-full transition-transform hover:scale-[1.01]">
      {inner}
    </a>
  ) : (
    inner
  );
}

export default async function MinhaPerformancePage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const perfil = await lerPerfilInstagram(org.orgId);

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-5">
      <header className="flex items-center gap-3">
        <Link href="/app/instagram" className="text-sm font-medium" style={{ color: "var(--color-accent)" }}>
          ← Instagram
        </Link>
      </header>

      {!perfil ? (
        <section className="wr-card-accent p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-[22px] font-bold" style={{ color: "#F3F4EC" }}>
              Minha Performance
            </h1>
            <p className="text-sm mt-1" style={{ color: "#B9BCC6" }}>
              Conecte sua conta Instagram para ver seguidores, posts e engajamento aqui.
            </p>
          </div>
          <Link
            href="/app/instagram/conectar"
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-bold whitespace-nowrap"
            style={{ background: "var(--color-accent)", color: "#1B2206" }}
          >
            Conectar agora
          </Link>
        </section>
      ) : (
        <>
          {/* Cabeçalho do perfil */}
          <section className="wr-card-dark p-5 flex flex-wrap items-center gap-4">
            <span
              className="inline-flex items-center justify-center w-16 h-16 rounded-full overflow-hidden shrink-0"
              style={{ background: "var(--color-surface-elevated)", border: "2px solid var(--color-accent)" }}
            >
              {perfil.fotoPerfil ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={perfil.fotoPerfil} alt={perfil.username} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold" style={{ color: "var(--color-accent)" }}>
                  {perfil.username.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            <div className="min-w-0">
              <h1 className="font-heading text-[26px] font-bold leading-tight" style={{ color: "var(--color-text)" }}>
                Minha Performance
              </h1>
              <p className="text-[15px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                @{perfil.username}
                {perfil.tipoConta ? ` · ${TIPO_CONTA[perfil.tipoConta] ?? perfil.tipoConta}` : ""}
                {perfil.nome ? ` · ${perfil.nome}` : ""}
              </p>
            </div>
          </section>

          {/* KPIs */}
          <section className="flex flex-wrap gap-3">
            <Kpi label="Seguidores" valor={compact(perfil.seguidores)} sub={nf(perfil.seguidores)} />
            <Kpi label="Posts" valor={nf(perfil.posts)} />
            <Kpi label="Seguindo" valor={nf(perfil.seguindo)} />
            <Kpi
              label="Engajamento médio"
              valor={`${perfil.engajamento.toLocaleString("pt-BR")}%`}
              sub="por post recente"
            />
          </section>

          {/* Posts recentes */}
          <section>
            <h2 className="font-heading text-[18px] font-bold mb-3" style={{ color: "var(--color-text)" }}>
              Posts recentes
            </h2>
            {perfil.midias.length === 0 ? (
              <div className="wr-card-dark p-5 text-sm" style={{ color: "var(--color-text-muted)" }}>
                Nenhum post recente encontrado.
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {perfil.midias.map((m) => (
                  <PostCard key={m.id} m={m} />
                ))}
              </div>
            )}
          </section>

          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Dados oficiais da API do Instagram (atualizados a cada carregamento). O engajamento médio
            considera os posts recentes acima sobre o total de seguidores.
          </p>
        </>
      )}
    </div>
  );
}

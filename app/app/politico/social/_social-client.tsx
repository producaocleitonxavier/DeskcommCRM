"use client";

/**
 * Visual do Monitoramento Social (War Room 2.0): KPIs, comparativo de
 * engajamento por plataforma (BarChart), grid de perfis e timeline de posts.
 */

import { Bell, Heart, Star, Users } from "lucide-react";

import { KpiCard } from "@/components/politico/kpi-card";
import { BarChartCard } from "@/components/politico/bar-chart-card";
import { SectionHeader } from "@/components/politico/section-header";
import { EmptyState } from "@/components/politico/empty-state";

const CATEGORIA: Record<string, { label: string; bg: string; fg: string }> = {
  monitorado: { label: "Monitorado", bg: "#E4E7F8", fg: "#2F3DA8" },
  influencer: { label: "Influenciador", bg: "#EADDFB", fg: "#6D28D9" },
  aliado: { label: "Aliado", bg: "#E2F5EC", fg: "#17784F" },
  neutro: { label: "Neutro", bg: "#F0F0EB", fg: "#5B606B" },
  adversario: { label: "Adversário", bg: "#FBE4E2", fg: "#A3302A" },
};

export interface PerfilItem {
  id: string;
  username: string;
  displayName: string | null;
  platform: string;
  followers: number;
  engagementRate: number;
  category: string;
  active: boolean;
}

export interface PostItem {
  id: string;
  platform: string;
  caption: string | null;
  likes: number;
  comments: number;
  postedAt: string | null;
}

export interface SocialClientProps {
  kpis: { totalPerfis: number; influenciadores: number; postsColetados: number; alertas: number };
  engajamentoPorPlataforma: { name: string; value: number; fill: string }[];
  perfis: PerfilItem[];
  posts: PostItem[];
}

export default function SocialClient({ kpis, engajamentoPorPlataforma, perfis, posts }: SocialClientProps) {
  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <SectionHeader title="Monitoramento Social" subtitle="Perfis, engajamento e inteligência de redes sociais." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Perfis monitorados" valor={kpis.totalPerfis} icone={Users} />
        <KpiCard label="Influenciadores" valor={kpis.influenciadores} icone={Star} />
        <KpiCard label="Posts coletados" valor={kpis.postsColetados} icone={Heart} />
        <KpiCard label="Alertas de inteligência" valor={kpis.alertas} icone={Bell} />
      </section>

      {perfis.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum perfil monitorado"
          description="Adicione o primeiro perfil social para acompanhar engajamento, crescimento e inteligência da campanha."
        />
      ) : (
        <>
          {engajamentoPorPlataforma.length > 0 && (
            <BarChartCard title="Engajamento médio por plataforma (%)" data={engajamentoPorPlataforma} height={280} />
          )}

          <section className="space-y-3">
            <SectionHeader title={`Perfis (${perfis.length})`} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perfis.map((p) => {
                const cat = CATEGORIA[p.category] ?? CATEGORIA.monitorado!;
                return (
                  <div key={p.id} className="wr-card flex flex-col gap-2.5 p-5 transition-shadow duration-200 hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">@{p.username}</div>
                        {p.displayName && <div className="truncate text-xs text-muted-foreground">{p.displayName}</div>}
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: p.active ? "#E2F5EC" : "#F0F0EB", color: p.active ? "#17784F" : "#5B606B" }}
                      >
                        {p.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium capitalize" style={{ background: "#F0F0EB", color: "#5B606B" }}>
                        {p.platform}
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: cat.bg, color: cat.fg }}>
                        {cat.label}
                      </span>
                    </div>
                    <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-sm" style={{ borderColor: "var(--color-border)" }}>
                      <span><strong className="tabular-nums">{p.followers.toLocaleString("pt-BR")}</strong> <span className="text-muted-foreground">seguidores</span></span>
                      <span className="tabular-nums font-semibold" style={{ color: "#2F3DA8" }}>{p.engagementRate.toFixed(2)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {posts.length > 0 && (
            <section className="wr-card p-6 sm:p-7">
              <h2 className="mb-4 font-heading text-base font-bold">Posts recentes monitorados</h2>
              <ul className="space-y-3">
                {posts.map((post) => (
                  <li key={post.id} className="flex items-start gap-3 border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: "var(--color-border)" }}>
                    <span className="mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize" style={{ background: "#F0F0EB", color: "#5B606B" }}>
                      {post.platform}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm">{post.caption ?? "(sem legenda)"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {post.likes.toLocaleString("pt-BR")} curtidas · {post.comments.toLocaleString("pt-BR")} comentários
                        {post.postedAt ? ` · ${new Date(post.postedAt).toLocaleDateString("pt-BR")}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

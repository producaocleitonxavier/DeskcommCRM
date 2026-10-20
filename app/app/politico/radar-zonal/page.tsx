/**
 * /app/politico/radar-zonal — Radar Zonal (HUB do Território, War Room 2.0).
 *
 * A zona como unidade de operação, em 3 visões (?view=):
 *  - radar    (default): por candidato num município → votos, bairros, locais e
 *             os LEADS da nossa base por zona (./_radar-client).
 *  - projecao: universo de votos do cargo × a base do CRM por zona + leitura IA
 *             (../mapa-eleitoral/_projecao-client).
 *  - base     ("Minha Base"): mapa de calor dos contatos do CRM por cidade
 *             (../mapa-eleitoral/_territorio-client).
 *
 * Fundiu o antigo "Mapa Eleitoral" aqui (Mapa de Votos/choropleth foi removido).
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import { listarEleicoes } from "@/app/actions/politico/intelEleitoral";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";
import RadarClient from "./_radar-client";
import ProjecaoClient from "../mapa-eleitoral/_projecao-client";
import TerritorioClient, { type CidadeRow } from "../mapa-eleitoral/_territorio-client";

export const dynamic = "force-dynamic";

interface OportunidadeRow {
  territory_id: string;
  name: string;
  state_code: string | null;
  latitude: number | null;
  longitude: number | null;
  total_leads: number;
  novos_cadastros: number;
  simpatizantes: number;
  apoiadores: number;
}

async function buscarOportunidades(organizationId: string): Promise<OportunidadeRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("pol_vw_mapa_oportunidades")
    .select("territory_id, name, state_code, latitude, longitude, total_leads, novos_cadastros, simpatizantes, apoiadores")
    .eq("organization_id", organizationId)
    .order("total_leads", { ascending: false })
    .limit(600);
  if (error) {
    console.error("Erro ao buscar oportunidades:", error.message);
    return [];
  }
  return (data ?? []) as unknown as OportunidadeRow[];
}

export default async function RadarZonalPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const view = params.view === "projecao" || params.view === "base" ? params.view : "radar";

  const [eleicoes, municipios] = await Promise.all([listarEleicoes(), listarMunicipiosRaioX()]);

  // Dados da visão "Minha Base" (CRM por cidade).
  const oportunidades = view === "base" ? await buscarOportunidades(org.orgId) : [];
  const cidades: CidadeRow[] = oportunidades
    .filter((o) => o.latitude != null && o.longitude != null)
    .map((o) => ({
      id: o.territory_id,
      name: o.name,
      uf: o.state_code,
      lat: Number(o.latitude),
      lng: Number(o.longitude),
      total: o.total_leads,
      novos: o.novos_cadastros,
      simpatizantes: o.simpatizantes,
      apoiadores: o.apoiadores,
      forca: o.novos_cadastros * 1 + o.simpatizantes * 3 + o.apoiadores * 6,
    }))
    .sort((a, b) => b.total - a.total);
  const totalContatos = cidades.reduce((s, c) => s + c.total, 0);
  const cidadeTop = cidades[0]?.name ?? "—";
  const concentracaoTopPct = totalContatos > 0 && cidades[0] ? Math.round((cidades[0].total / totalContatos) * 100) : 0;

  const tabs = [
    { value: "radar", label: "Radar", href: "/app/politico/radar-zonal" },
    { value: "projecao", label: "Projeção", href: "/app/politico/radar-zonal?view=projecao" },
    { value: "base", label: "Minha Base", href: "/app/politico/radar-zonal?view=base" },
  ];

  return (
    <div className="mx-auto max-w-[1140px] space-y-6 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · TSE + CRM"
        titulo="Radar Zonal"
        subtitulo="A zona como unidade de operação: votos, bairros, locais e a sua base — cruzados."
        extra={
          <div role="tablist" aria-label="Visões do Radar" className="flex gap-1.5">
            {tabs.map((tab) => {
              const active = view === tab.value;
              return (
                <Link key={tab.value} href={tab.href} role="tab" aria-selected={active}
                  className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-semibold transition-colors"
                  style={active ? { background: "#D7F36A", color: "#14181F" } : { border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)" }}>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        }
      />

      {eleicoes.length === 0 ? (
        <div className="wr-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Dados eleitorais ainda não carregados nesta instalação.</p>
        </div>
      ) : view === "radar" ? (
        <RadarClient eleicoes={eleicoes} municipios={municipios} />
      ) : view === "projecao" ? (
        <ProjecaoClient eleicoes={eleicoes} municipios={municipios} />
      ) : (
        <>
          <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden style={{ color: "#D7F36A" }} />
            <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
              <strong style={{ color: "#fff" }}>Minha Base</strong> são os contatos do <strong style={{ color: "#fff" }}>seu CRM</strong> (da sua operação) distribuídos pelas cidades onde moram.
              Cada bolha é uma cidade — tamanho = quantidade de contatos, cor = força (novos ×1, simpatizantes ×3, apoiadores ×6).
            </p>
          </div>
          {cidades.length === 0 ? (
            <div className="wr-card p-12 text-center">
              <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhuma cidade localizada ainda. Vincule os contatos a municípios com latitude e longitude.</p>
            </div>
          ) : (
            <TerritorioClient cidades={cidades} totalContatos={totalContatos} cidadeTop={cidadeTop} concentracaoTopPct={concentracaoTopPct} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * /app/politico/mapa-eleitoral — Território (War Room 2.0)
 *
 * Camada "Zonas": mapa de calor de cidades (força × alcance) + ranking + tabela
 * (./_territorio-client). Camada "Prioridade": territórios por status estratégico.
 * Views: pol_vw_mapa_oportunidades + pol_vw_mapa_prioridade.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import TerritorioClient, { type CidadeRow } from "./_territorio-client";
import EleicoesClient from "./_eleicoes-client";
import ProjecaoClient from "./_projecao-client";
import { listarEleicoes, candidatosDaEleicao, mapaMunicipio, listarMunicipios } from "@/app/actions/politico/intelEleitoral";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

interface OportunidadeRow {
  territory_id: string;
  name: string;
  type: string;
  state_code: string | null;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  electorate: number | null;
  total_leads: number;
  novos_cadastros: number;
  simpatizantes: number;
  apoiadores: number;
  potencial_conversao: number;
  penetracao_pct: number;
  classificacao: string;
}

// -- Data fetching -----------------------------------------------------------

async function buscarOportunidades(organizationId: string): Promise<OportunidadeRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("pol_vw_mapa_oportunidades")
    .select("*")
    .eq("organization_id", organizationId)
    .order("total_leads", { ascending: false })
    .limit(600);

  if (error) {
    console.error("Erro ao buscar oportunidades:", error.message);
    return [];
  }
  return (data ?? []) as unknown as OportunidadeRow[];
}

// -- Camada Eleições (Inteligência/TSE) --------------------------------------

// Prioridade de cargo no seletor: Governador, Prefeito, Dep. Federal, Estadual, Vereador.
const CARGO_PRIO: Record<number, number> = { 3: 0, 11: 1, 6: 2, 7: 3, 13: 4 };

async function montarEleicoes(eleicaoParam?: string, candParam?: string) {
  const eleicoes = await listarEleicoes();
  if (eleicoes.length === 0) {
    return { eleicoes: [], eleicaoInicial: 0, candidatos: [], candidatoInicial: "", pontos: [], nomes: {} as Record<string, string> };
  }
  eleicoes.sort(
    (a, b) => b.ano - a.ano || (CARGO_PRIO[a.cargo_cod] ?? 9) - (CARGO_PRIO[b.cargo_cod] ?? 9) || b.turno - a.turno,
  );
  const sel = eleicoes.find((e) => String(e.id) === eleicaoParam) ?? eleicoes[0]!;
  const [candidatos, nomes] = await Promise.all([candidatosDaEleicao(sel.id), listarMunicipios()]);
  const candidatoInicial = candidatos.find((c) => c.nr === candParam)?.nr ?? candidatos[0]?.nr ?? "";
  const pontos = candidatoInicial ? await mapaMunicipio(sel.id, candidatoInicial) : [];
  return { eleicoes, eleicaoInicial: sel.id, candidatos, candidatoInicial, pontos, nomes };
}

// -- Componente principal ----------------------------------------------------

export default async function TerritorioPage({
  searchParams,
}: {
  searchParams: Promise<{ camada?: string; eleicao?: string; cand?: string }>;
}) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  // Entrada didática: o mapa de votos (TSE) é a primeira leitura; CRM e projeção na sequência.
  const camada = params.camada ?? "eleicoes";

  const oportunidades = camada === "oportunidades" ? await buscarOportunidades(org.orgId) : [];

  // Camada "Eleições" (Inteligência/TSE): choropleth por município.
  const eleicoesData = camada === "eleicoes" ? await montarEleicoes(params.eleicao, params.cand) : null;

  // Camada "Projeção" (dado vivo): universo de votos × base do CRM por zona.
  const projecaoData = camada === "projecao"
    ? await Promise.all([listarEleicoes(), listarMunicipiosRaioX()])
    : null;

  // -- Camada oportunidades: cidades geolocalizadas + força --
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
      // Força = engajamento ponderado por nível de apoio (reflete "força real").
      forca: o.novos_cadastros * 1 + o.simpatizantes * 3 + o.apoiadores * 6,
    }))
    .sort((a, b) => b.total - a.total);

  const totalContatos = cidades.reduce((s, c) => s + c.total, 0);
  const cidadeTop = cidades[0]?.name ?? "—";
  const concentracaoTopPct =
    totalContatos > 0 && cidades[0] ? Math.round((cidades[0].total / totalContatos) * 100) : 0;

  const tabs = [
    { value: "eleicoes", label: "Mapa de Votos", href: "/app/politico/mapa-eleitoral" },
    { value: "oportunidades", label: "Minha Força", href: "/app/politico/mapa-eleitoral?camada=oportunidades" },
    { value: "projecao", label: "Projeção", href: "/app/politico/mapa-eleitoral?camada=projecao" },
  ];

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header (Centro de Comando) ──────────────────────────── */}
      <CommandHero
        eyebrow="War Room · Território"
        titulo="Território"
        subtitulo="Onde estão os votos e onde falta gente cadastrada."
        extra={
          <div role="tablist" aria-label="Camadas do território" className="flex gap-1.5">
            {tabs.map((tab) => {
              const active = camada === tab.value;
              return (
                <Link
                  key={tab.value}
                  href={tab.href}
                  role="tab"
                  aria-selected={active}
                  className="inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-semibold transition-colors"
                  style={
                    active
                      ? { background: "#D7F36A", color: "#14181F" }
                      : { border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)" }
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        }
      />

      {/* ── Camada: Minha Força (base do CRM por cidade) ────────── */}
      {camada === "oportunidades" && (
        <>
          <div className="flex items-start gap-2.5 rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden style={{ color: "#D7F36A" }} />
            <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>
              <strong style={{ color: "#fff" }}>Minha Força</strong> é a <strong style={{ color: "#fff" }}>sua base</strong>: os contatos do seu CRM distribuídos pelas cidades onde moram.
              Cada bolha é uma cidade — o tamanho mostra <strong style={{ color: "#fff" }}>quantos contatos</strong> você tem lá e a cor, a <strong style={{ color: "#fff" }}>força</strong> (novos ×1, simpatizantes ×3, apoiadores ×6).
              É o oposto do <strong style={{ color: "#fff" }}>Mapa de Votos</strong> (que mostra o voto do TSE): aqui é onde VOCÊ já tem gente.
            </p>
          </div>
          {cidades.length === 0 ? (
            <div className="wr-card p-12 text-center">
              <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
                Nenhuma cidade localizada ainda. Vincule os contatos a municípios com latitude e longitude.
              </p>
            </div>
          ) : (
            <TerritorioClient
              cidades={cidades}
              totalContatos={totalContatos}
              cidadeTop={cidadeTop}
              concentracaoTopPct={concentracaoTopPct}
            />
          )}
        </>
      )}

      {/* ── Camada: Eleições (Inteligência/TSE) ──────────────────── */}
      {camada === "eleicoes" &&
        (eleicoesData && eleicoesData.eleicoes.length > 0 ? (
          <EleicoesClient
            eleicoes={eleicoesData.eleicoes}
            eleicaoInicial={eleicoesData.eleicaoInicial}
            candidatosIniciais={eleicoesData.candidatos}
            candidatoInicial={eleicoesData.candidatoInicial}
            pontosIniciais={eleicoesData.pontos}
            nomes={eleicoesData.nomes}
          />
        ) : (
          <div className="wr-card p-12 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Dados eleitorais ainda não carregados nesta instalação.
            </p>
          </div>
        ))}

      {/* ── Camada: Projeção (dado vivo — universo × base por zona) ── */}
      {camada === "projecao" &&
        (projecaoData && projecaoData[0].length > 0 ? (
          <ProjecaoClient eleicoes={projecaoData[0]} municipios={projecaoData[1]} />
        ) : (
          <div className="wr-card p-12 text-center">
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
              Dados eleitorais ainda não carregados nesta instalação.
            </p>
          </div>
        ))}
    </div>
  );
}

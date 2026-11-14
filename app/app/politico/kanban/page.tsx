/**
 * /app/politico/kanban — MOBILIZAÇÃO (quadro de campanha)
 *
 * Server component: auth + carga. As pessoas aparecem como cards em colunas por
 * nível de relacionamento (support_level). O operador move à mão (override); o motor de
 * engajamento move sozinho. Puxado pela mesma taxonomia do Disparos (origem →
 * grupo). Visual + filtros em ./_client.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { corDoGrupo, corDaOrigem, humanizarOrigem } from "@/lib/politico/rotulo-origem";
import KanbanClient, { type CardPessoa, type ColunaKanban, type GrupoChip } from "./_client";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";
import { rotuloDoNivel } from "@/lib/politico/niveis";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mobilização" };

/**
 * Os 4 níveis de relacionamento + cor (ramp índigo). Rótulos: lib/politico/niveis.ts.
 * "Voto certo" não existe no mandato: registro antigo guardado assim entra na
 * coluna Multiplicador (por isso `valores` — o que a coluna lê do banco).
 */
const ETAPAS: ReadonlyArray<{ value: string; valores: string[]; label: string; cor: string }> = [
  { value: "novo_cadastro", valores: ["novo_cadastro"], label: rotuloDoNivel("novo_cadastro"), cor: "#C9CEF3" },
  { value: "simpatizante", valores: ["simpatizante"], label: rotuloDoNivel("simpatizante"), cor: "#9AA5EA" },
  { value: "apoiador", valores: ["apoiador"], label: rotuloDoNivel("apoiador"), cor: "#6B79DD" },
  { value: "militante", valores: ["militante", "voto_certo"], label: rotuloDoNivel("militante"), cor: "#4352C4" },
];

/** No máximo isto de cards por coluna (o total real vem à parte, por head count). */
const CAP_POR_COLUNA = 100;

interface LeadRow {
  contact_id: string;
  support_level: string;
  temperature: string | null;
  territory_id: string | null;
  political_score: number | null;
  updated_at: string | null;
  contacts: { name: string | null; source: string | null } | null;
}

export default async function KanbanPage() {
  await exigirAcessoPolitico("kanban");
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const orgId = org.orgId;

  // Grupos de origem (pra cor + filtro) e o mapeamento origem→grupo.
  const [gruposRes, mapaRes, territoriosRes] = await Promise.all([
    db
      .from("pol_origem_grupos")
      .select("id, nome, ordem")
      .eq("organization_id", orgId)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true }),
    db.from("pol_origem_mapeamento").select("source, grupo_id").eq("organization_id", orgId),
    db.from("pol_territories").select("id, name").eq("organization_id", orgId),
  ]);

  const gruposRaw = (gruposRes.data ?? []) as { id: string; nome: string; ordem: number }[];
  const mapa = (mapaRes.data ?? []) as { source: string; grupo_id: string }[];
  const territorios = (territoriosRes.data ?? []) as { id: string; name: string | null }[];

  // id do grupo → { nome, cor } (cor determinística por índice, igual às outras telas).
  const grupoInfo = new Map<string, { nome: string; cor: string }>();
  gruposRaw.forEach((g, i) => grupoInfo.set(g.id, { nome: g.nome, cor: corDoGrupo(i) }));
  const grupoPorSource = new Map(mapa.map((m) => [m.source, m.grupo_id]));
  const cidadePorTerritorio = new Map(territorios.map((t) => [t.id, t.name ?? null]));

  const gruposChips: GrupoChip[] = gruposRaw.map((g, i) => ({ nome: g.nome, cor: corDoGrupo(i) }));

  // Total real por etapa (head count — não sofre o cap de 1000 do PostgREST).
  const totais = await Promise.all(
    ETAPAS.map(async (e) => {
      const { count } = await db
        .from("pol_leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("support_level", e.valores);
      return count ?? 0;
    }),
  );

  // Cards por etapa (capados). Uma query por etapa, bounded. Join por hint
  // contacts!contact_id (há duas FKs pol_leads→contacts).
  const cardsPorEtapa = await Promise.all(
    ETAPAS.map(async (e) => {
      const { data } = await db
        .from("pol_leads")
        .select(
          "contact_id, support_level, temperature, territory_id, political_score, updated_at, contacts!contact_id(name, source)",
        )
        .eq("organization_id", orgId)
        .in("support_level", e.valores)
        .order("updated_at", { ascending: false })
        .limit(CAP_POR_COLUNA);
      return (data ?? []) as unknown as LeadRow[];
    }),
  );

  const colunas: ColunaKanban[] = ETAPAS.map((e, idx) => {
    const cards: CardPessoa[] = cardsPorEtapa[idx]!.map((l) => {
      const source = l.contacts?.source ?? null;
      const gid = source ? grupoPorSource.get(source) : undefined;
      const g = gid ? grupoInfo.get(gid) : undefined;
      return {
        contactId: l.contact_id,
        nome: l.contacts?.name ?? "Sem nome",
        source,
        sourceLabel: source ? humanizarOrigem(source) : null,
        grupoNome: g?.nome ?? null,
        // Agrupada usa a cor do grupo; solta ganha a cor própria da origem (mosaico).
        grupoCor: g?.cor ?? (source ? corDaOrigem(source) : null),
        cidade: l.territory_id ? (cidadePorTerritorio.get(l.territory_id) ?? null) : null,
        temperatura: (l.temperature ?? "frio") as string,
        score: Number(l.political_score) || 0,
        ultimaInteracao: l.updated_at ?? null,
      };
    });
    return { estagio: e.value, label: e.label, cor: e.cor, total: totais[idx]!, cards };
  });

  return <KanbanClient colunas={colunas} grupos={gruposChips} />;
}

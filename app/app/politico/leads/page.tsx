/**
 * /app/politico/leads — Pessoas (War Room 2.0)
 *
 * Server component: auth + fetch (pol_leads + contagens por etapa). O visual
 * (cards, filtros, paginação) vive em ./_leads-client, que usa componentes de
 * components/politico/ e ícones LucideIcon.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import type { BaseTerritorioResumo } from "@/components/politico/base-territorio-hero";
import LeadsClient from "./_leads-client";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";

const POR_PAGINA = 24;

const SUPPORT_LEVELS = ["novo_cadastro", "simpatizante", "apoiador", "militante", "voto_certo"] as const;

export interface LeadRow {
  id: string;
  support_level: string;
  temperature: string;
  political_score: number;
  territory_id: string | null;
  created_at: string;
  contacts: {
    name: string | null;
    phone_number: string | null;
    source: string | null;
    last_activity_at: string | null;
    tags: string[] | null;
  } | null;
  pol_territories: { name: string } | null;
}

export interface CidadeOpcao {
  id: string;
  name: string;
  n: number;
}

async function buscarLeads(
  organizationId: string,
  pagina: number,
  etapa?: string,
  busca?: string,
  temp?: string,
  cidade?: string,
  esfriando?: boolean,
) {
  const db = await createClient();
  const offset = (pagina - 1) * POR_PAGINA;

  // Busca por nome: cada PALAVRA precisa aparecer (AND), em qualquer ordem — assim
  // "ana gabriela silva" acha "ANA GABRIELA MARTINS DA SILVA". E o embed vira INNER
  // quando há busca: sem isso o PostgREST filtra o EMBED (não o pai) e devolve os
  // leads que NÃO casam com contacts=null — o bug dos cards "Sem nome".
  const palavras = busca ? busca.trim().split(/\s+/).filter(Boolean) : [];
  // Embed SEMPRE inner: além de consertar os cards "Sem nome" na busca, é o que
  // permite filtrar o PAI por uma coluna do contato (is_blocked). Todo lead tem
  // contato (FK contact_id), então inner não esconde ninguém legítimo.
  const contatoEmbed = "contacts!contact_id!inner(name, phone_number, source, last_activity_at, tags)";

  let query = db
    .from("pol_leads")
    .select(
      // contacts!contact_id: pol_leads tem 2 FKs para contacts (contact_id e
      // mobilizer_id); sem o hint o embed fica ambiguo (PGRST201) e a lista volta vazia.
      `id, support_level, temperature, political_score, territory_id, created_at, ${contatoEmbed}, pol_territories(name)`,
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    // Quem pediu para sair (opt-out / descadastro) some da base ativa. `is not
    // true` pega tanto false quanto null (o normal de quem nunca foi bloqueado).
    .not("contacts.is_blocked", "is", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + POR_PAGINA - 1);

  if (etapa) query = query.eq("support_level", etapa);
  if (temp) query = query.eq("temperature", temp);
  if (cidade) query = query.eq("territory_id", cidade);
  // "Esfriando": contatos QUENTES sem atividade há 7+ dias — mesmo critério do card
  // "contatos quentes esfriando" da tela Hoje. Filtra o pai pela coluna do embed inner.
  if (esfriando) {
    const corte7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
    query = query.eq("temperature", "quente").lt("contacts.last_activity_at", corte7d);
  }
  // Busca por NOME ou TELEFONE: muito contato tem só o 1º nome ("Leandro", e há
  // vários) — aí buscar pelo telefone acha direto. Se o termo tem ≥4 dígitos, é
  // telefone (casa o trecho de dígitos no phone_number E.164, ignorando formatação);
  // senão, busca por nome (cada palavra precisa aparecer, em qualquer ordem).
  const soDigitos = (busca ?? "").replace(/\D/g, "");
  if (soDigitos.length >= 4) {
    query = query.ilike("contacts.phone_number", `%${soDigitos}%`);
  } else {
    for (const p of palavras) query = query.ilike("contacts.name", `%${p}%`);
  }

  const { data, count } = await query;
  return { leads: (data as unknown as LeadRow[]) ?? [], total: count ?? 0 };
}

/** Cidades (territórios) com contagem, para o filtro — via view agregada. */
async function buscarCidades(organizationId: string): Promise<CidadeOpcao[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_vw_mapa_oportunidades")
    .select("territory_id, name, total_leads")
    .eq("organization_id", organizationId)
    .order("total_leads", { ascending: false })
    .limit(600);
  return ((data ?? []) as { territory_id: string; name: string; total_leads: number }[]).map((r) => ({
    id: r.territory_id,
    name: r.name,
    n: r.total_leads,
  }));
}

/**
 * Mapa de calor da base por CIDADE (dado exato via pol_mapa_base_municipios:
 * cidade do cadastro → IBGE por intel_municipios). `naoLocalizados` é preenchido
 * depois, no corpo da página, com o total da base menos os mapeados.
 */
async function buscarMapaBase(organizationId: string): Promise<Omit<BaseTerritorioResumo, "naoLocalizados">> {
  const db = await createClient();
  const { data } = await db.rpc("pol_mapa_base_municipios", { p_org: organizationId });
  const linhas = ((data ?? []) as { ibge_code: string; nome: string; total: number | string }[]).map((r) => ({
    ibge: r.ibge_code,
    nome: r.nome,
    total: Number(r.total) || 0,
  }));
  linhas.sort((a, b) => b.total - a.total);
  return {
    pontos: linhas,
    mapeados: linhas.reduce((s, p) => s + p.total, 0),
    cidades: linhas.length,
    cidadeTop: linhas[0]?.nome ?? "",
  };
}

async function contarPorEtapa(organizationId: string): Promise<Record<string, number>> {
  const db = await createClient();
  const counts: Record<string, number> = {};

  // As contagens excluem os descadastrados, para baterem com a lista: embed inner
  // em contacts + filtro is_blocked. O `contacts!contact_id!inner(id)` não traz
  // dado (head:true), só serve de join para o filtro valer sobre o pai.
  const { count: totalCount } = await db
    .from("pol_leads")
    .select("id, contacts!contact_id!inner(id)", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .not("contacts.is_blocked", "is", true);
  counts._total = totalCount ?? 0;

  await Promise.all(
    SUPPORT_LEVELS.map(async (lvl) => {
      const { count } = await db
        .from("pol_leads")
        .select("id, contacts!contact_id!inner(id)", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .not("contacts.is_blocked", "is", true)
        .eq("support_level", lvl);
      counts[lvl] = count ?? 0;
    }),
  );

  return counts;
}

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirAcessoPolitico("pessoas");
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const etapa = typeof params.etapa === "string" ? params.etapa : "";
  const busca = typeof params.busca === "string" ? params.busca : "";
  const temp = typeof params.temp === "string" ? params.temp : "";
  const cidade = typeof params.cidade === "string" ? params.cidade : "";
  const esfriando = params.esfriando === "1" || params.esfriando === "true";

  const [{ leads, total }, contagens, cidades, mapaBase] = await Promise.all([
    buscarLeads(org.orgId, pagina, etapa || undefined, busca || undefined, temp || undefined, cidade || undefined, esfriando),
    contarPorEtapa(org.orgId),
    buscarCidades(org.orgId),
    buscarMapaBase(org.orgId),
  ]);

  const mapaResumo: BaseTerritorioResumo = {
    ...mapaBase,
    naoLocalizados: Math.max(0, (contagens._total ?? 0) - mapaBase.mapeados),
  };

  return (
    <LeadsClient
      leads={leads}
      total={total}
      contagens={contagens}
      cidades={cidades}
      mapaResumo={mapaResumo}
      filtros={{ etapa, busca, temp, cidade, pagina, esfriando }}
      porPagina={POR_PAGINA}
      podeManutencao={ROLE_RANK[org.role] >= ROLE_RANK.manager}
    />
  );
}

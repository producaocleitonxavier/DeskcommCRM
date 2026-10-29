/**
 * /app/politico/prestacao-contas — Painel do Mandato (Fase B #4).
 *
 * A LENTE DO TRABALHO DO MANDATO (prestação de contas), complementar ao Painel
 * de campanha (/dashboard): demandas atendidas, tempo médio, ofícios, obras,
 * emendas, base e avisos. "Trabalho invisível virado em número — e, num clique,
 * relatório." Acesso: manager+. Reaproveita os dados que já existem (demandas,
 * pol_demanda_eventos, pol_obras, pol_emendas, contacts) — não refaz nada.
 */
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import PageTabs from "@/components/politico/page-tabs";
import PrestacaoContasClient from "./_client";

const COMANDO_TABS = [
  { id: "hoje", label: "Hoje", href: "/app/politico" },
  { id: "painel", label: "Painel", href: "/app/politico/dashboard" },
  { id: "prestacao", label: "Prestação de Contas", href: "/app/politico/prestacao-contas" },
];

export const dynamic = "force-dynamic";

export type Periodo = "mes" | "trimestre" | "mandato";

export interface PrestacaoContas {
  periodo: Periodo;
  demandasAtendidas: number;
  tempoMedioDias: number | null;
  oficios: number;
  avisos: number;
  obrasEntregues: number;
  obrasAndamento: number;
  emendasValor: number; // em reais
  emendasQtd: number;
  baseTotal: number;
  baseNovos: number;
  evolucao: { mes: string; valor: number }[];
  topBairros: { bairro: string; valor: number }[];
}

function inicioDoPeriodo(p: Periodo): string | null {
  const agora = new Date();
  if (p === "mes") {
    const d = new Date(agora.getFullYear(), agora.getMonth(), 1);
    return d.toISOString();
  }
  if (p === "trimestre") {
    const d = new Date(agora.getTime() - 90 * 86_400_000);
    return d.toISOString();
  }
  return null; // mandato inteiro
}

async function contar(
  db: Awaited<ReturnType<typeof createClient>>,
  tabela: string,
  orgId: string,
  filtros: (q: any) => any,
): Promise<number> {
  let q = db.from(tabela).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  q = filtros(q);
  const { count } = await q;
  return count ?? 0;
}

async function buscar(orgId: string, periodo: Periodo): Promise<PrestacaoContas> {
  const db = await createClient();
  const desde = inicioDoPeriodo(periodo);

  // Demandas atendidas (resolvidas pelo gabinete, fora autoatendimento) no período
  const demandasAtendidas = await contar(db, "demandas", orgId, (q) => {
    q = q.eq("pol_gabinete", true).eq("estado", "resolvida").eq("pol_autoatendimento", false);
    if (desde) q = q.gte("fechada_em", desde);
    return q;
  });

  // Tempo médio de resolução (dias) no período
  let tempoQ = db
    .from("demandas")
    .select("aberta_em, fechada_em")
    .eq("organization_id", orgId)
    .eq("pol_gabinete", true)
    .eq("estado", "resolvida")
    .not("fechada_em", "is", null)
    .limit(500);
  if (desde) tempoQ = tempoQ.gte("fechada_em", desde);
  const { data: fech } = await tempoQ;
  const fechadas = (fech ?? []) as { aberta_em: string; fechada_em: string }[];
  const tempoMedioDias =
    fechadas.length > 0
      ? Math.round(
          (fechadas.reduce((s, d) => s + (new Date(d.fechada_em).getTime() - new Date(d.aberta_em).getTime()), 0) /
            fechadas.length /
            86_400_000) * 10,
        ) / 10
      : null;

  const oficios = await contar(db, "pol_demanda_eventos", orgId, (q) => {
    q = q.eq("tipo", "oficio_emitido");
    if (desde) q = q.gte("created_at", desde);
    return q;
  });
  const avisos = await contar(db, "pol_demanda_eventos", orgId, (q) => {
    q = q.eq("tipo", "cidadao_avisado");
    if (desde) q = q.gte("created_at", desde);
    return q;
  });

  const obrasEntregues = await contar(db, "pol_obras", orgId, (q) => q.eq("status", "concluida"));
  const obrasAndamento = await contar(db, "pol_obras", orgId, (q) => q.eq("status", "em_andamento"));

  const { data: emRows } = await db
    .from("pol_emendas")
    .select("valor_indicado_cents")
    .eq("organization_id", orgId)
    .limit(1000);
  const emendas = (emRows ?? []) as { valor_indicado_cents: number | null }[];
  const emendasValor = Math.round(emendas.reduce((s, e) => s + (e.valor_indicado_cents ?? 0), 0) / 100);
  const emendasQtd = emendas.length;

  const baseTotal = await contar(db, "contacts", orgId, (q) => q);
  const baseNovos = await contar(db, "contacts", orgId, (q) => (desde ? q.gte("created_at", desde) : q.gte("created_at", "1970-01-01")));

  // Evolução: demandas resolvidas por mês (últimos 6 meses)
  const evolucao: { mes: string; valor: number }[] = [];
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  for (let i = 5; i >= 0; i--) {
    const ini = new Date();
    ini.setMonth(ini.getMonth() - i, 1);
    ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini);
    fim.setMonth(fim.getMonth() + 1);
    const v = await contar(db, "demandas", orgId, (q) =>
      q.eq("pol_gabinete", true).eq("estado", "resolvida").gte("fechada_em", ini.toISOString()).lt("fechada_em", fim.toISOString()),
    );
    evolucao.push({ mes: MES[ini.getMonth()] ?? "", valor: v });
  }

  // Top bairros atendidos (demandas do gabinete)
  let bairroQ = db
    .from("demandas")
    .select("pol_bairro")
    .eq("organization_id", orgId)
    .eq("pol_gabinete", true)
    .not("pol_bairro", "is", null)
    .limit(2000);
  if (desde) bairroQ = bairroQ.gte("aberta_em", desde);
  const { data: bRows } = await bairroQ;
  const cont: Record<string, number> = {};
  for (const r of (bRows ?? []) as { pol_bairro: string | null }[]) {
    const b = (r.pol_bairro ?? "").trim();
    if (b) cont[b] = (cont[b] ?? 0) + 1;
  }
  const topBairros = Object.entries(cont)
    .map(([bairro, valor]) => ({ bairro, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  return {
    periodo,
    demandasAtendidas,
    tempoMedioDias,
    oficios,
    avisos,
    obrasEntregues,
    obrasAndamento,
    emendasValor,
    emendasQtd,
    baseTotal,
    baseNovos,
    evolucao,
    topBairros,
  };
}

export default async function PrestacaoContasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const pRaw = typeof params.periodo === "string" ? params.periodo : "mandato";
  const periodo: Periodo = pRaw === "mes" || pRaw === "trimestre" ? pRaw : "mandato";

  const dados = await buscar(org.orgId, periodo);

  return (
    <>
      <PageTabs abas={COMANDO_TABS} active="prestacao" maxW="1140px" />
      <PrestacaoContasClient dados={dados} />
    </>
  );
}

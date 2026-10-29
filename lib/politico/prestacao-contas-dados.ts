/**
 * Dados do Painel do Mandato (prestação de contas). Fonte ÚNICA usada pela tela
 * (`/app/politico/prestacao-contas`) E pelo relatório em PDF — para a tela e o
 * papel contarem SEMPRE a mesma coisa. Reaproveita o que já existe (demandas,
 * pol_demanda_eventos, pol_obras, pol_emendas, contacts); não refaz nada.
 */
import { createClient } from "@/lib/supabase/server";
import { CHAVE_GABINETE } from "@/lib/politico/aviso-de-resolucao";

export type Periodo = "mes" | "trimestre" | "mandato";

/** Chave das metas em settings.gabinete. Metas são do MANDATO (total). */
export const CHAVE_METAS = "metas";

export interface MetasDoMandato {
  demandas: number | null;
  oficios: number | null;
  obras: number | null;
  base: number | null;
}

export function lerMetas(settings: unknown): MetasDoMandato {
  const s = (settings ?? {}) as Record<string, unknown>;
  const gab = (s[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  const m = (gab[CHAVE_METAS] ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number | null => (typeof v === "number" && v > 0 ? v : null);
  return { demandas: n(m.demandas), oficios: n(m.oficios), obras: n(m.obras), base: n(m.base) };
}

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
  // Para as METAS do mandato: totais SEM filtro de período (o mandato inteiro).
  totaisMandato: { demandas: number; oficios: number; obras: number; base: number };
  metas: MetasDoMandato;
}

export const PERIODO_LABEL: Record<Periodo, string> = {
  mes: "Este mês",
  trimestre: "Últimos 3 meses",
  mandato: "Mandato inteiro",
};

export function normalizarPeriodo(v: unknown): Periodo {
  return v === "mes" || v === "trimestre" ? v : "mandato";
}

function inicioDoPeriodo(p: Periodo): string | null {
  const agora = new Date();
  if (p === "mes") return new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  if (p === "trimestre") return new Date(agora.getTime() - 90 * 86_400_000).toISOString();
  return null;
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

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export async function buscarPrestacaoContas(orgId: string, periodo: Periodo): Promise<PrestacaoContas> {
  const db = await createClient();
  const desde = inicioDoPeriodo(periodo);

  const demandasAtendidas = await contar(db, "demandas", orgId, (q) => {
    q = q.eq("pol_gabinete", true).eq("estado", "resolvida").eq("pol_autoatendimento", false);
    if (desde) q = q.gte("fechada_em", desde);
    return q;
  });

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
  const baseNovos = desde ? await contar(db, "contacts", orgId, (q) => q.gte("created_at", desde)) : 0;

  const evolucao: { mes: string; valor: number }[] = [];
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

  // Totais do MANDATO (sem período) — base das metas.
  const demandasTotM = await contar(db, "demandas", orgId, (q) =>
    q.eq("pol_gabinete", true).eq("estado", "resolvida").eq("pol_autoatendimento", false),
  );
  const oficiosTotM = await contar(db, "pol_demanda_eventos", orgId, (q) => q.eq("tipo", "oficio_emitido"));
  // obrasEntregues já é sem período; base também.
  const totaisMandato = { demandas: demandasTotM, oficios: oficiosTotM, obras: obrasEntregues, base: baseTotal };

  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const metas = lerMetas((orgRow as { settings?: unknown } | null)?.settings);

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
    totaisMandato,
    metas,
  };
}

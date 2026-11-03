"use server";

/**
 * Exporta as DEMANDAS do gabinete em CSV (abre no Excel). Respeita os filtros da
 * tela (estado, órgão, "precisa cobrar"). Server-only, org-scoped pela sessão.
 * CSV com BOM UTF-8 e separador ";" (padrão do Excel pt-BR). Colunas: Data,
 * Assunto, Tipo, Órgão destino, Status, Prazo (dias), Atrasada, Respondeu.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type CsvResultado = { ok: true; csv: string; nome: string } | { ok: false; erro: string };

export interface FiltrosCsvDemandas {
  estado?: string;
  orgao?: string;
  cobrar?: boolean;
}

const ESTADO_LABEL: Record<string, string> = {
  aberta: "Nova",
  em_atendimento: "Em atendimento",
  encaminhada: "Encaminhada",
  aguardando_cliente: "Aguardando",
  resolvida: "Atendida",
  encerrada: "Encerrada",
};
const PRAZO_PADRAO = 30;

function dataBR(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}
/** Célula CSV: escapa aspas e envolve o campo (lida com ; , aspas e quebra de linha). */
function cel(v: unknown): string {
  const s = String(v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

interface LinhaDemanda {
  assunto: string | null;
  pol_tipo: string | null;
  pol_orgao_destino: string | null;
  estado: string;
  aberta_em: string;
  pol_prazo_dias: number | null;
  pol_respondeu?: boolean | null;
}

export async function gerarCsvDemandas(filtros: FiltrosCsvDemandas = {}): Promise<CsvResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const colsBase = "assunto, pol_tipo, pol_orgao_destino, estado, aberta_em, pol_prazo_dias";

  function montar(cols: string) {
    let q = db
      .from("demandas")
      .select(cols)
      .eq("organization_id", org!.orgId)
      .eq("pol_gabinete", true)
      .order("aberta_em", { ascending: false })
      .limit(5000);
    if (filtros.estado) q = q.eq("estado", filtros.estado);
    if (filtros.orgao) q = q.eq("pol_orgao_destino", filtros.orgao);
    if (filtros.cobrar) q = q.not("estado", "in", "(resolvida,encerrada)").eq("pol_respondeu", false);
    return q;
  }

  // Tenta com pol_respondeu (migration 9084); se a coluna não existir, cai p/ o base.
  let temRespondeu = true;
  let res = await montar(`${colsBase}, pol_respondeu`);
  if (res.error && !filtros.cobrar) {
    temRespondeu = false;
    res = await montar(colsBase);
  }
  if (res.error) return { ok: false, erro: "Erro ao carregar as demandas." };

  const linhas = (res.data ?? []) as unknown as LinhaDemanda[];
  const agora = Date.now();

  const header = ["Data", "Assunto", "Tipo", "Órgão destino", "Status", "Prazo (dias)", "Atrasada", "Respondeu"];
  const corpo = linhas.map((d) => {
    const dias = d.pol_prazo_dias && d.pol_prazo_dias > 0 ? d.pol_prazo_dias : PRAZO_PADRAO;
    const limite = new Date(d.aberta_em).getTime() + dias * 86_400_000;
    const aberta = !["resolvida", "encerrada"].includes(d.estado);
    const atrasada = aberta && agora > limite ? "Sim" : "Não";
    const respondeu = !temRespondeu ? "—" : d.pol_respondeu === true ? "Sim" : "Não";
    return [
      dataBR(d.aberta_em),
      d.assunto ?? "",
      d.pol_tipo ? d.pol_tipo.replace(/_/g, " ") : "",
      d.pol_orgao_destino ?? "",
      ESTADO_LABEL[d.estado] ?? d.estado,
      String(dias),
      atrasada,
      respondeu,
    ];
  });

  const linhasCsv = [header, ...corpo].map((l) => l.map(cel).join(";"));
  // BOM UTF-8 para o Excel abrir com acentuação correta.
  const csv = "﻿" + linhasCsv.join("\r\n");
  const nome = `demandas-${new Date().toISOString().slice(0, 10)}.csv`;
  return { ok: true, csv, nome };
}

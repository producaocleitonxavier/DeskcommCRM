"use server";

/**
 * Raio-X de Votos (Módulo Inteligência / TSE). Explorador por candidato no
 * nível de SEÇÃO (padrão dos sites de raio-x eleitoral, com a nossa cara).
 * Fluxo: eleição+cargo → busca/ranking de candidatos → detalhe com drill por
 * município → zona/bairro/local/seção. Tudo via sessão autenticada (RLS das
 * intel_* = leitura pública); agregações pesadas em RPC.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/server";

export interface CandidatoRank {
  sq: string;
  nr: string;
  nomeUrna: string;
  nome: string;
  partido: string | null;
  situacao: string | null;
  votos: number;
  posicao: number;
}

export interface ResumoCandidato {
  sq: string;
  nr: string;
  nome: string;
  nomeUrna: string;
  partido: string | null;
  situacao: string | null;
  coligacao: string | null;
  votos: number;
  totalEleicao: number; // votos válidos nominais do cargo (p/ %)
}

export interface DrillLinha {
  chave: string;
  rotulo: string;
  votos: number;
  universo: number; // votos válidos do município (p/ % relativa)
}

/** Total de votos válidos (nominais) do cargo na eleição (p/ % no ranking). */
export async function eleicaoTotal(electionId: number): Promise<number> {
  await requireAuth();
  const db = await createClient();
  const { data } = await db.rpc("intel_eleicao_total", { p_election: electionId });
  return Number(data ?? 0);
}

/** Ranking/busca de candidatos de uma eleição (q opcional = nome/número). */
export async function rankingCandidatos(electionId: number, q = "", limit = 50, offset = 0): Promise<CandidatoRank[]> {
  await requireAuth();
  const db = await createClient();
  const { data, error } = await db.rpc("intel_cand_ranking", {
    p_election: electionId,
    p_q: q || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !data) return [];
  return (data as {
    sq_candidato: number; nr_votavel: string; nome_urna: string | null; nome: string;
    partido_sigla: string | null; situacao: string | null; votos_total: number; posicao: number;
  }[]).map((r) => ({
    sq: String(r.sq_candidato),
    nr: r.nr_votavel,
    nomeUrna: r.nome_urna ?? r.nome,
    nome: r.nome,
    partido: r.partido_sigla,
    situacao: r.situacao,
    votos: Number(r.votos_total),
    posicao: Number(r.posicao),
  }));
}

/** Cabeçalho do candidato: metadados + total da eleição (p/ % estadual). */
export async function resumoCandidato(electionId: number, sq: string): Promise<ResumoCandidato | null> {
  await requireAuth();
  const db = await createClient();
  const [{ data: c }, { data: total }] = await Promise.all([
    db.from("intel_candidatos")
      .select("sq_candidato, nr_votavel, nome, nome_urna, partido_sigla, situacao, coligacao, votos_total")
      .eq("election_id", electionId)
      .eq("sq_candidato", sq)
      .maybeSingle(),
    db.rpc("intel_eleicao_total", { p_election: electionId }),
  ]);
  if (!c) return null;
  const r = c as {
    sq_candidato: number; nr_votavel: string; nome: string; nome_urna: string | null;
    partido_sigla: string | null; situacao: string | null; coligacao: string | null; votos_total: number;
  };
  return {
    sq: String(r.sq_candidato),
    nr: r.nr_votavel,
    nome: r.nome,
    nomeUrna: r.nome_urna ?? r.nome,
    partido: r.partido_sigla,
    situacao: r.situacao,
    coligacao: r.coligacao,
    votos: Number(r.votos_total),
    totalEleicao: Number(total ?? 0),
  };
}

/** Drill do candidato: dim ∈ municipio|zona|bairro|local|secao. zona/bairro/local/secao exigem município (código TSE). */
export async function drillCandidato(
  electionId: number,
  sq: string,
  dim: "municipio" | "zona" | "bairro" | "local" | "secao",
  municipio?: number,
): Promise<DrillLinha[]> {
  await requireAuth();
  const db = await createClient();
  const { data, error } = await db.rpc("intel_cand_drill", {
    p_election: electionId,
    p_sq: sq,
    p_dim: dim,
    p_municipio: municipio ?? null,
  });
  if (error || !data) return [];
  return (data as { chave: string; rotulo: string; votos: number; universo: number }[]).map((r) => ({
    chave: r.chave,
    rotulo: r.rotulo,
    votos: Number(r.votos),
    universo: Number(r.universo),
  }));
}

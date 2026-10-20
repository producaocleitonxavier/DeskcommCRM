"use server";

/**
 * Módulo Inteligência — Pilar 1 (Análise Eleitoral/TSE). Camada de dados do
 * MAPA DE CALOR eleitoral (choropleth por município). Leitura das tabelas de
 * referência públicas intel_* via sessão autenticada (RLS = leitura liberada
 * p/ autenticado). As agregações pesadas rodam em RPC no Postgres.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/server";

export interface EleicaoOpcao {
  id: number;
  ano: number;
  turno: number;
  cargo_cod: number;
  cargo: string;
  uf: string;
  label: string; // "Prefeito 2024 (2º turno)"
}

export interface CandidatoOpcao {
  nr: string;
  nome: string;
  partidoNum: number | null;
  votos: number;
}

export interface MapaMunicipioPonto {
  ibge: string;
  cand: number; // votos do candidato
  total: number; // votos válidos do cargo no município
}

function rotuloEleicao(e: { ano: number; turno: number; cargo: string }): string {
  const t = e.turno > 1 ? ` (${e.turno}º turno)` : "";
  return `${e.cargo} ${e.ano}${t}`;
}

/** Lista as eleições disponíveis (ordenadas: ano desc, cargo, turno). */
export async function listarEleicoes(): Promise<EleicaoOpcao[]> {
  await requireAuth();
  const db = await createClient();
  const { data, error } = await db
    .from("intel_elections")
    .select("id, ano, turno, cargo_cod, cargo, uf")
    .order("ano", { ascending: false })
    .order("cargo", { ascending: true })
    .order("turno", { ascending: true });
  if (error || !data) return [];
  return (data as Omit<EleicaoOpcao, "label">[]).map((e) => ({ ...e, label: rotuloEleicao(e) }));
}

/** Candidatos de uma eleição, ordenados por votos (para o seletor). */
export async function candidatosDaEleicao(electionId: number, limite = 100): Promise<CandidatoOpcao[]> {
  await requireAuth();
  const db = await createClient();
  const { data, error } = await db.rpc("intel_eleicao_candidatos", { p_election: electionId, p_limit: limite });
  if (error || !data) return [];
  return (data as { nr_votavel: string; nm_votavel: string; partido_num: number | null; votos: number }[]).map((r) => ({
    nr: r.nr_votavel,
    nome: r.nm_votavel,
    partidoNum: r.partido_num,
    votos: Number(r.votos),
  }));
}

/** Mapa ibge_code -> nome do município (para rótulos/tooltips do choropleth). */
export async function listarMunicipios(uf = "MG"): Promise<Record<string, string>> {
  await requireAuth();
  const db = await createClient();
  const { data, error } = await db.from("intel_municipios").select("ibge_code, nome").eq("uf", uf);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const m of data as { ibge_code: string; nome: string }[]) out[m.ibge_code] = m.nome;
  return out;
}

/** Dados do choropleth: por município, votos do candidato e total do cargo. */
export async function mapaMunicipio(electionId: number, nr: string): Promise<MapaMunicipioPonto[]> {
  await requireAuth();
  const db = await createClient();
  const { data, error } = await db.rpc("intel_mapa_municipio", { p_election: electionId, p_nr: nr });
  if (error || !data) return [];
  return (data as { ibge_code: string; cand_votos: number; total_votos: number }[]).map((r) => ({
    ibge: r.ibge_code,
    cand: Number(r.cand_votos),
    total: Number(r.total_votos),
  }));
}

/**
 * Choropleth por SQ_CANDIDATO (identificador único) — CORRETO. O por NR somava
 * o número entre candidatos diferentes (números se repetem entre municípios),
 * inflando o mapa (ex.: um vereador aparecendo "em 435 municípios").
 */
export async function mapaMunicipioSq(electionId: number, sq: string): Promise<MapaMunicipioPonto[]> {
  await requireAuth();
  const db = await createClient();
  const { data, error } = await db.rpc("intel_mapa_municipio_sq", { p_election: electionId, p_sq: Number(sq) });
  if (error || !data) return [];
  return (data as { ibge_code: string; cand_votos: number; total_votos: number }[]).map((r) => ({
    ibge: r.ibge_code,
    cand: Number(r.cand_votos),
    total: Number(r.total_votos),
  }));
}

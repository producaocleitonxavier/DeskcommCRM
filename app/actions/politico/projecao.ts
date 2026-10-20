"use server";

/**
 * Projeção VIVA — fusão Mapa Eleitoral + Projeção. Substitui a projeção legada
 * (pol_tse_data, tabela TSE vazia nesta instalação) por um cruzamento do dado
 * vivo: UNIVERSO de votos do cargo por zona (intel_universo_zona) × SUA BASE do
 * CRM por zona (intel_zona_leads, respeitando RLS da org). Para cada zona, mede
 * cobertura (base/universo) e classifica estrategicamente — honesto, sem prever
 * voto que não existe: a "oportunidade" é volume de voto alto onde você ainda
 * tem pouca presença.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/server";

export type ClasseZona = "reduto" | "consolidar" | "oportunidade" | "deserto";

export interface ProjecaoZona {
  zona: number;
  universo: number; // votos do cargo na zona (tamanho do "mercado" eleitoral)
  base: number; // leads do CRM mapeados na zona
  cobertura: number; // base / universo (fração) — presença relativa
  oportunidade: number; // score: volume de voto ainda pouco explorado
  classe: ClasseZona;
  bairros: string[];
}

export interface ProjecaoResumo {
  universoTotal: number;
  baseTotal: number;
  coberturaMedia: number;
  zonas: ProjecaoZona[];
}

export async function projecaoZonal(electionId: number, municipioTse: string, ano: number): Promise<ProjecaoResumo> {
  await requireAuth();
  const db = await createClient();
  const cd = Number(municipioTse);

  const [{ data: universo }, { data: leadsRows }] = await Promise.all([
    db.rpc("intel_universo_zona", { p_election: electionId, p_municipio: cd }),
    db.rpc("intel_zona_leads", { p_municipio: cd, p_ano: ano }),
  ]);

  const leadsPorZona = new Map<number, number>();
  for (const r of (leadsRows ?? []) as { nr_zona: number; leads: number }[]) leadsPorZona.set(Number(r.nr_zona), Number(r.leads));

  const linhas = ((universo ?? []) as { nr_zona: number; universo: number; bairros: string[] | null }[]).map((u) => {
    const zona = Number(u.nr_zona);
    const uni = Number(u.universo);
    const base = leadsPorZona.get(zona) ?? 0;
    const cobertura = uni > 0 ? base / uni : 0;
    return { zona, universo: uni, base, cobertura, bairros: u.bairros ?? [] };
  });

  const universoTotal = linhas.reduce((s, l) => s + l.universo, 0);
  const baseTotal = linhas.reduce((s, l) => s + l.base, 0);
  // Medianas da própria cidade para a régua ser relativa ao contexto local.
  const medUniverso = mediana(linhas.map((l) => l.universo));
  const medCobertura = mediana(linhas.filter((l) => l.base > 0).map((l) => l.cobertura));

  const zonas: ProjecaoZona[] = linhas
    .map((l) => {
      // Oportunidade = volume de voto (universo) ponderado pela sua AUSÊNCIA relativa.
      const faltaPresenca = medCobertura > 0 ? Math.max(0, 1 - l.cobertura / medCobertura) : 1;
      const oportunidade = Math.round(l.universo * faltaPresenca);
      let classe: ClasseZona;
      if (l.base === 0) classe = "deserto";
      else if (l.cobertura >= medCobertura) classe = "reduto";
      else if (l.universo >= medUniverso) classe = "oportunidade";
      else classe = "consolidar";
      return { ...l, oportunidade, classe };
    })
    .sort((a, b) => b.universo - a.universo);

  return { universoTotal, baseTotal, coberturaMedia: universoTotal > 0 ? baseTotal / universoTotal : 0, zonas };
}

export interface ProjecaoRegiao {
  regional: string;
  universo: number;
  base: number;
  cobertura: number;
  oportunidade: number;
  classe: ClasseZona;
  bairros: string[];
}

export interface ProjecaoRegionalResumo {
  universoTotal: number;
  baseTotal: number;
  coberturaMedia: number;
  regioes: ProjecaoRegiao[];
}

/** Projeção agregada por REGIONAL administrativa (só para municípios com o mapa, ex.: BH, Contagem). */
export async function projecaoRegional(electionId: number, municipioTse: string, ano: number): Promise<ProjecaoRegionalResumo> {
  await requireAuth();
  const db = await createClient();
  const cd = Number(municipioTse);

  const [{ data: universo }, { data: leadsRows }] = await Promise.all([
    db.rpc("intel_universo_regional", { p_election: electionId, p_municipio: cd }),
    db.rpc("intel_regional_leads", { p_municipio: cd, p_ano: ano }),
  ]);

  const leadsPorReg = new Map<string, number>();
  for (const r of (leadsRows ?? []) as { regional: string; leads: number }[]) leadsPorReg.set(r.regional, Number(r.leads));

  const linhas = ((universo ?? []) as { regional: string; universo: number; bairros: string[] | null }[]).map((u) => {
    const uni = Number(u.universo);
    const base = leadsPorReg.get(u.regional) ?? 0;
    return { regional: u.regional, universo: uni, base, cobertura: uni > 0 ? base / uni : 0, bairros: u.bairros ?? [] };
  });

  const universoTotal = linhas.reduce((s, l) => s + l.universo, 0);
  const baseTotal = linhas.reduce((s, l) => s + l.base, 0);
  const medUniverso = mediana(linhas.map((l) => l.universo));
  const medCobertura = mediana(linhas.filter((l) => l.base > 0).map((l) => l.cobertura));

  const regioes: ProjecaoRegiao[] = linhas
    .map((l) => {
      const faltaPresenca = medCobertura > 0 ? Math.max(0, 1 - l.cobertura / medCobertura) : 1;
      const oportunidade = Math.round(l.universo * faltaPresenca);
      let classe: ClasseZona;
      if (l.base === 0) classe = "deserto";
      else if (l.cobertura >= medCobertura) classe = "reduto";
      else if (l.universo >= medUniverso) classe = "oportunidade";
      else classe = "consolidar";
      return { ...l, oportunidade, classe };
    })
    .sort((a, b) => b.universo - a.universo);

  return { universoTotal, baseTotal, coberturaMedia: universoTotal > 0 ? baseTotal / universoTotal : 0, regioes };
}

function mediana(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

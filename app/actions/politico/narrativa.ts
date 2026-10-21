"use server";

/**
 * Pilar 3 — Narrativas Territoriais por IA. Para um BAIRRO, cruza o voto do
 * mandato (TSE) × a base do CRM da operação × demandas × lideranças × a "batalha"
 * local (adversários no bairro) e a IA escreve uma narrativa estratégica do
 * território, com riscos, oportunidades e ações. Só dados reais — nada inventado.
 * Persiste em intel_territorial_narratives (cache + histórico). Degrada em PT.
 */

import { generateText } from "ai";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { obterMandatoTse } from "@/app/actions/politico/obras-actions";

export interface NarrativaTerritorial {
  id: string;
  bairro: string;
  regional: string | null;
  municipioNome: string;
  texto: string;
  riscos: string[];
  oportunidades: string[];
  acoes: string[];
  fontes: {
    meusVotos: number;
    universo: number;
    leads: number;
    quentes: number;
    mornos: number;
    frios: number;
    fortes: number;
    demAbertas: number;
    demResolvidas: number;
    liderancas: number;
    adversarios: { nome: string; partido: string | null; votos: number }[];
  };
  geradoEm: string;
}

type Resultado = { ok: true; narrativa: NarrativaTerritorial } | { ok: false; erro: string };

function mapRow(r: Record<string, unknown>): NarrativaTerritorial {
  return {
    id: r.id as string,
    bairro: r.bairro as string,
    regional: (r.regional as string | null) ?? null,
    municipioNome: (r.municipio_nome as string | null) ?? "",
    texto: r.narrative_text as string,
    riscos: (r.risks as string[]) ?? [],
    oportunidades: (r.opportunities as string[]) ?? [],
    acoes: (r.recommended_actions as string[]) ?? [],
    fontes: (r.data_sources as NarrativaTerritorial["fontes"]) ?? {
      meusVotos: 0, universo: 0, leads: 0, quentes: 0, mornos: 0, frios: 0, fortes: 0, demAbertas: 0, demResolvidas: 0, liderancas: 0, adversarios: [],
    },
    geradoEm: r.generated_at as string,
  };
}

/** Narrativa mais recente salva para um bairro (cache / histórico). */
export async function obterNarrativaRecente(cdMunicipio: number, bairro: string): Promise<NarrativaTerritorial | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const db = await createClient();
  const { data } = await db
    .from("intel_territorial_narratives")
    .select("*")
    .eq("organization_id", org.orgId)
    .eq("cd_municipio", cdMunicipio)
    .eq("bairro", bairro)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** Abre uma narrativa salva pelo id (clique no histórico). */
export async function obterNarrativaPorId(id: string): Promise<NarrativaTerritorial | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const db = await createClient();
  const { data } = await db
    .from("intel_territorial_narratives")
    .select("*")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

/** Histórico de narrativas da org (lista). */
export async function listarNarrativas(limit = 20): Promise<{ id: string; bairro: string; regional: string | null; municipioNome: string; geradoEm: string }[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("intel_territorial_narratives")
    .select("id, bairro, regional, municipio_nome, generated_at")
    .eq("organization_id", org.orgId)
    .order("generated_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    bairro: r.bairro as string,
    regional: (r.regional as string | null) ?? null,
    municipioNome: (r.municipio_nome as string | null) ?? "",
    geradoEm: r.generated_at as string,
  }));
}

function extrairJson(texto: string): { narrativa?: string; riscos?: string[]; oportunidades?: string[]; acoes?: string[] } | null {
  // A IA às vezes embrulha o JSON em ```json … ```; pega do primeiro { ao último }.
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try {
    return JSON.parse(texto.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

/** Gera (ou regenera) a narrativa territorial de um bairro. */
export async function gerarNarrativa(cdMunicipio: number, munNome: string, bairro: string): Promise<Resultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (!bairro.trim()) return { ok: false, erro: "Escolha um bairro." };

  const mandato = await obterMandatoTse();
  if (!mandato) return { ok: false, erro: "Configure o seu mandato (candidato TSE) em Obras › Meu mandato antes de gerar narrativas." };

  const db = await createClient();
  const [pesoRes, advRes, crmRes, lidRes, regRes] = await Promise.all([
    db.rpc("intel_peso_bairro", { p_election: mandato.electionId, p_sq: Number(mandato.sq), p_municipio: cdMunicipio, p_bairro: bairro }),
    db.rpc("intel_adversarios_bairro", { p_election: mandato.electionId, p_municipio: cdMunicipio, p_bairro: bairro, p_limit: 8 }),
    db.rpc("intel_bairro_crm", { p_cidade: munNome, p_bairro: bairro }),
    db.from("pol_liderancas").select("nome, cargo, tipo, nivel_engajamento").eq("organization_id", org.orgId).eq("status", "ativo").ilike("bairro", bairro).limit(12),
    db.from("intel_bairro_regional").select("regional").eq("cd_municipio", cdMunicipio).ilike("bairro", bairro).limit(1).maybeSingle(),
  ]);

  const peso = ((pesoRes.data ?? [])[0] ?? { meus_votos: 0, universo: 0, leads: 0 }) as { meus_votos: number; universo: number; leads: number };
  const crm = ((crmRes.data ?? [])[0] ?? {}) as { leads_total?: number; leads_quente?: number; leads_morno?: number; leads_frio?: number; leads_forte?: number; dem_abertas?: number; dem_resolvidas?: number };
  const advAll = ((advRes.data ?? []) as { sq_candidato: number; nome: string; partido: string | null; votos: number }[]);
  const adversarios = advAll.filter((a) => Number(a.sq_candidato) !== Number(mandato.sq)).slice(0, 5)
    .map((a) => ({ nome: a.nome, partido: a.partido, votos: Number(a.votos) }));
  const liderancas = ((lidRes.data ?? []) as { nome: string; cargo: string | null; tipo: string; nivel_engajamento: string }[]);
  const regional = (regRes.data as { regional?: string } | null)?.regional ?? null;

  const fontes: NarrativaTerritorial["fontes"] = {
    meusVotos: Number(peso.meus_votos ?? 0),
    universo: Number(peso.universo ?? 0),
    leads: Number(crm.leads_total ?? peso.leads ?? 0),
    quentes: Number(crm.leads_quente ?? 0),
    mornos: Number(crm.leads_morno ?? 0),
    frios: Number(crm.leads_frio ?? 0),
    fortes: Number(crm.leads_forte ?? 0),
    demAbertas: Number(crm.dem_abertas ?? 0),
    demResolvidas: Number(crm.dem_resolvidas ?? 0),
    liderancas: liderancas.length,
    adversarios,
  };

  const pctBairro = fontes.universo > 0 ? ((fontes.meusVotos / fontes.universo) * 100).toFixed(1) : "0";
  const fatos: string[] = [
    `TERRITÓRIO: bairro ${bairro}${regional ? `, regional administrativa ${regional}` : ""}, em ${munNome}.`,
    `VOTO (TSE) do seu candidato (${mandato.nome || "mandato"}) NESTE bairro: ${fontes.meusVotos.toLocaleString("pt-BR")} votos, de um universo de ${fontes.universo.toLocaleString("pt-BR")} votos do cargo no bairro (${pctBairro}%).`,
    `A BATALHA no bairro (candidatos que mais fizeram voto AQUI, fora você): ${adversarios.length ? adversarios.map((a) => `${a.nome}${a.partido ? ` (${a.partido})` : ""} — ${a.votos.toLocaleString("pt-BR")} votos`).join("; ") : "sem dado de adversário"}.`,
    `BASE DE CRM DA OPERAÇÃO no bairro (contatos da campanha que usa a ferramenta — NÃO são eleitores nem a base do candidato analisado): ${fontes.leads.toLocaleString("pt-BR")} contatos — ${fontes.quentes} quentes, ${fontes.mornos} mornos, ${fontes.frios} frios; ${fontes.fortes} já apoiadores ou mais.`,
    `DEMANDAS do gabinete de contatos deste bairro: ${fontes.demAbertas} em aberto, ${fontes.demResolvidas} resolvidas.`,
    `LIDERANÇAS ativas no bairro (${fontes.liderancas}): ${liderancas.length ? liderancas.map((l) => `${l.nome}${l.cargo ? ` (${l.cargo})` : ""} [engajamento ${l.nivel_engajamento}]`).join("; ") : "nenhuma cadastrada aqui"}.`,
    `MÍDIA: monitoramento de mídia ainda não está ativo nesta conta — não há menções a considerar.`,
  ];

  const cerebro = await cerebroDaOrg(createAdminClient(), org.orgId);
  if ("erro" in cerebro) return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };

  const regraRegional = regional
    ? `A regional administrativa deste bairro é ${regional} (verificada por geografia). Pode citá-la. `
    : "Você NÃO recebeu a regional administrativa deste bairro — NUNCA invente ou infira uma 'regional'/'região' pelo nome do bairro. ";

  const system =
    "Você é chefe de inteligência de uma campanha eleitoral no Brasil. Recebe dados REAIS (TSE + CRM + gabinete) de UM bairro e escreve uma NARRATIVA TERRITORIAL estratégica e acionável, em português do Brasil. " +
    "Use APENAS os números fornecidos — nunca invente votos, pesquisas, nomes, mídia ou fatos. " +
    "DISTINÇÃO CRÍTICA: o VOTO é do TSE; a BASE DE CRM é da OPERAÇÃO que usa a ferramenta, NÃO é do candidato nem é 'eleitorado'. Chame o universo de 'votos do cargo', nunca 'eleitores'. " +
    regraRegional +
    "Não prometa resultado futuro: 'oportunidade' é volume de voto onde a base de CRM é fraca, ou mornos a converter, ou liderança a acionar. " +
    "RESPONDA SOMENTE um objeto JSON válido (sem texto fora dele, sem crase), com as chaves: " +
    '{"narrativa": "<markdown de 2-3 parágrafos contando a história política do bairro: domínio/disputa, base, demandas, lideranças>", ' +
    '"riscos": ["<risco concreto>", ...], "oportunidades": ["<oportunidade concreta>", ...], "acoes": ["<ação concreta e específica>", ...]}. ' +
    "Cada lista com 2 a 4 itens, curtos e específicos ao bairro. Cite nomes de lideranças e adversários quando fizer sentido.";

  const prompt = `Gere a narrativa territorial do bairro com base nos dados:\n\n${fatos.join("\n")}\n\nResponda só o JSON.`;

  const modelo = modeloDoCerebro(cerebro);
  let parsed: { narrativa?: string; riscos?: string[]; oportunidades?: string[]; acoes?: string[] } | null = null;
  let usage: { inputTokens?: number; outputTokens?: number } = {};
  try {
    const res = await generateText({ model: modelo, system, prompt, maxOutputTokens: 1400 });
    parsed = extrairJson(res.text);
    usage = { inputTokens: res.usage?.inputTokens, outputTokens: res.usage?.outputTokens };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente novamente em instantes." };
  }
  if (!parsed || !parsed.narrativa) return { ok: false, erro: "A IA não retornou no formato esperado. Tente novamente." };

  const riscos = Array.isArray(parsed.riscos) ? parsed.riscos.filter((x) => typeof x === "string").slice(0, 6) : [];
  const oportunidades = Array.isArray(parsed.oportunidades) ? parsed.oportunidades.filter((x) => typeof x === "string").slice(0, 6) : [];
  const acoes = Array.isArray(parsed.acoes) ? parsed.acoes.filter((x) => typeof x === "string").slice(0, 6) : [];

  // Persiste (cache + histórico).
  const { data: inserted } = await db
    .from("intel_territorial_narratives")
    .insert({
      organization_id: org.orgId,
      election_id: mandato.electionId,
      cd_municipio: cdMunicipio,
      municipio_nome: munNome,
      bairro,
      regional,
      narrative_text: parsed.narrativa,
      risks: riscos,
      opportunities: oportunidades,
      recommended_actions: acoes,
      data_sources: fontes,
      ai_model: (modelo as { modelId?: string }).modelId ?? null,
      prompt_tokens: usage.inputTokens ?? null,
      completion_tokens: usage.outputTokens ?? null,
    })
    .select("*")
    .maybeSingle();

  if (!inserted) {
    // Mesmo se o insert falhar, devolve a narrativa gerada (não perde o trabalho da IA).
    return {
      ok: true,
      narrativa: {
        id: "", bairro, regional, municipioNome: munNome, texto: parsed.narrativa,
        riscos, oportunidades, acoes, fontes, geradoEm: new Date().toISOString(),
      },
    };
  }
  return { ok: true, narrativa: mapRow(inserted as Record<string, unknown>) };
}

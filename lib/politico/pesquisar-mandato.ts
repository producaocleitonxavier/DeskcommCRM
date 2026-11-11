/**
 * ENRIQUECIMENTO DO MANDATO — FASE 1: o CÉREBRO da busca.
 *
 * Depois do assistente de configuração, o gabinete pode pedir "aprofunde": a IA
 * busca na INTERNET informações públicas sobre o parlamentar e devolve achados
 * já separados em DOIS BALDES, cada um com a FONTE:
 *   • "cidadao" — factual e seguro (projetos, bandeiras, identidade) → vai pro RAG
 *                 do agente DEPOIS de o humano aprovar item a item;
 *   • "equipe"  — sensível/estratégico (polêmicas, processos, alianças) → fica SÓ
 *                 interno, NUNCA no RAG do cidadão.
 *
 * ⭐BUSCA CIENTE DO TIPO DE MANDATO (diretriz do cliente): não é Google solto
 * (provado: busca genérica volta ruído). Mira a FONTE OFICIAL certa pelo tipo +
 * cidade/UF — Câmara Municipal / Assembleia / Câmara dos Deputados — + TSE
 * (votação) + notícias locais.
 *
 * Usa a ferramenta de WEB SEARCH embutida da Anthropic (executada no servidor
 * deles), com a chave que a instalação/organização já tem. Esta fase NÃO grava
 * nada: só pesquisa e devolve os achados para a tela aprovar (fases 2 e 3).
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { chaveDePlataforma } from "@/lib/ai/runtime/agent";
import { loadCredential } from "@/lib/ai/credentials";
import { logger } from "@/lib/logger";
import type { DadosDoMandato } from "@/lib/politico/gerar-conhecimento";

/** Modelo com suporte a web search (atendimento padrão). */
const MODELO_DE_PESQUISA = "claude-sonnet-5";

export const achadoSchema = z.object({
  balde: z.enum(["cidadao", "equipe"]),
  titulo: z.string().trim().min(1).max(160),
  resumo: z.string().trim().min(1).max(600),
  fonte: z.string().trim().max(500),
});
export type AchadoEnriquecimento = z.infer<typeof achadoSchema>;

export type ResultadoPesquisa =
  | { ok: true; achados: AchadoEnriquecimento[] }
  | { ok: false; erro: string };

/** A fonte OFICIAL a mirar, pelo tipo de mandato + cidade/UF. */
export function fonteOficialDoMandato(dados: DadosDoMandato): string {
  const cidade = dados.cidade?.trim() || "a cidade";
  const uf = dados.uf?.trim() || "o estado";
  switch (dados.tipo) {
    case "vereador":
      return `o site OFICIAL da Câmara Municipal de ${cidade}`;
    case "prefeito":
      return `o site OFICIAL da Prefeitura de ${cidade}`;
    case "dep_estadual":
      return `o site OFICIAL da Assembleia Legislativa de ${uf} (ex.: almg.gov.br em MG, al.sp.gov.br em SP)`;
    case "dep_federal":
      return "o site OFICIAL da Câmara dos Deputados (camara.leg.br)";
    default:
      return "os sites oficiais do Legislativo onde o mandato atua";
  }
}

/** O prompt de pesquisa — direcionado, factual, com os 2 baldes e o guardrail TSE. */
export function montarPromptDePesquisa(dados: DadosDoMandato): string {
  const nome = dados.nome?.trim() || "o parlamentar";
  const cargo = dados.cargo?.trim() || "parlamentar";
  const cidade = dados.cidade?.trim() || "";
  const uf = dados.uf?.trim() || "";
  return `Você é um pesquisador de inteligência política. Pesquise na internet informações PÚBLICAS e VERIFICÁVEIS sobre ${nome} (${cargo}${cidade ? `, ${cidade}` : ""}${uf ? `/${uf}` : ""}).

ONDE BUSCAR (nesta ordem de prioridade, não uma busca genérica):
1. ${fonteOficialDoMandato(dados)} — projetos de lei de autoria, atuação, cargos em comissões.
2. O TSE e portais eleitorais — histórico de votação e eleições.
3. Notícias de veículos locais de ${cidade || "da região"}.

Classifique cada achado em UM de dois baldes:
- "cidadao": FACTUAL e seguro de o cidadão saber — projetos concretos, bandeiras, identidade, cargos. É o que a IA de atendimento pode citar.
- "equipe": SENSÍVEL ou estratégico — polêmicas, processos, derrotas, alianças partidárias, contexto político. É SÓ para a equipe, nunca para o cidadão.

REGRAS DURAS:
- Só inclua o que você REALMENTE encontrou, COM a URL da fonte. Nada de inventar nem supor.
- Tom FACTUAL. NUNCA escreva promessa de campanha, pedido de voto nem juízo de valor eleitoral.
- No máximo 10 achados, os mais relevantes.

Responda APENAS com um array JSON (sem texto antes ou depois, sem cercas de código), no formato:
[{"balde":"cidadao","titulo":"...","resumo":"1-2 frases factuais","fonte":"https://..."}]
Se não encontrar nada confiável, responda [].`;
}

/** Extrai o array JSON da resposta do modelo, tolerando cercas de código e texto ao redor. */
export function parseAchados(texto: string): AchadoEnriquecimento[] {
  const limpo = texto.replace(/```json/gi, "").replace(/```/g, "").trim();
  const inicio = limpo.indexOf("[");
  const fim = limpo.lastIndexOf("]");
  if (inicio < 0 || fim <= inicio) return [];
  let bruto: unknown;
  try {
    bruto = JSON.parse(limpo.slice(inicio, fim + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];
  const achados: AchadoEnriquecimento[] = [];
  for (const item of bruto) {
    const r = achadoSchema.safeParse(item);
    if (r.success) achados.push(r.data);
  }
  return achados;
}

/** A chave Anthropic da organização (credencial própria) ou da instalação (plataforma). */
async function chaveAnthropic(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: cred } = await admin
    .from("ai_provider_credentials")
    .select("id")
    .eq("organization_id", orgId)
    .eq("provider", "anthropic")
    .eq("is_active", true)
    .not("validated_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cred?.id) {
    try {
      const c = await loadCredential(cred.id as string, orgId);
      if (c.apiKey) return c.apiKey;
    } catch {
      /* cai na chave de plataforma */
    }
  }
  return chaveDePlataforma("anthropic");
}

/**
 * Pesquisa o mandato na web e devolve os achados nos 2 baldes. NÃO grava nada.
 * Nunca lança — devolve `{ ok: false }` com o motivo.
 */
export async function pesquisarMandato(
  admin: SupabaseClient,
  orgId: string,
  dados: DadosDoMandato,
): Promise<ResultadoPesquisa> {
  const apiKey = await chaveAnthropic(admin, orgId);
  if (!apiKey) return { ok: false, erro: "sem_chave_de_ia" };

  try {
    const anthropic = createAnthropic({ apiKey });
    // A busca é EXECUTADA pela Anthropic (ProviderExecutedTool). O tipo dela
    // (@ai-sdk/anthropic 4.x) não casa 1:1 com o ToolSet do `ai` 7.x por skew de
    // versão do @ai-sdk/provider — o `next build` tolera e o runtime é válido.
    // O cast assume isso explicitamente.
    const tools = { web_search: anthropic.tools.webSearch_20260209({ maxUses: 6 }) } as unknown as ToolSet;
    const result = await generateText({
      model: anthropic(MODELO_DE_PESQUISA),
      prompt: montarPromptDePesquisa(dados),
      tools,
      stopWhen: [stepCountIs(8)],
    });
    const achados = parseAchados(result.text ?? "");
    return { ok: true, achados };
  } catch (err) {
    logger.warn("pesquisar-mandato: busca falhou", {
      organization_id: orgId,
      causa: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, erro: "falha_na_busca" };
  }
}

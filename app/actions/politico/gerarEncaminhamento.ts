"use server";

/**
 * Gera, com a IA da organização, um texto de encaminhamento oficial para uma
 * demanda do gabinete. Diferencial do War Room: nenhum concorrente redige o
 * ofício automaticamente.
 *
 * Caminho leve (mesmo de app/actions/onboarding/montarQuadro.ts): resolve o
 * agente default da org → credencial BYOK (ou chave da instalação) → generateText
 * com teto baixo de tokens. Sem env nova (self-host). Degrada com mensagem em PT
 * quando a org não tem IA configurada. O texto volta para REVISÃO (não grava
 * sozinho) — quem decide o que vai ao órgão é o gabinete.
 */

import { generateText } from "ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildModel, chaveDePlataforma } from "@/lib/ai/runtime/agent";
import { loadCredential } from "@/lib/ai/credentials";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type ResultadoEncaminhamento = { ok: true; texto: string } | { ok: false; erro: string };

type Cerebro = { provider: string; model: string; apiKey: string };

// Modelo padrão da plataforma (era o AGENT_DEFAULT_MODEL do produto). Usado no
// fallback out-of-the-box quando a org ainda não configurou um agente de IA.
const MODELO_PADRAO = "claude-sonnet-4-5";

/** Tenta resolver pelo agente default publicado da org (BYOK ou chave de instalação). */
async function cerebroDoAgente(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<Cerebro | null> {
  const { data: agente } = await admin
    .from("ai_agents")
    .select("published_version_id")
    .eq("organization_id", orgId)
    .eq("is_default", true)
    .maybeSingle();

  const versionId = agente?.published_version_id as string | null | undefined;
  if (!versionId) return null;

  const { data: versao } = await admin
    .from("ai_agent_versions")
    .select("provider, model, credential_id")
    .eq("id", versionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!versao) return null;

  const provider = String(versao.provider ?? "");
  const model = String(versao.model ?? "");
  if (!provider || !model) return null;

  const credentialId = versao.credential_id as string | null;
  if (credentialId) {
    try {
      const cred = await loadCredential(credentialId, orgId);
      return { provider, model, apiKey: cred.apiKey };
    } catch {
      /* cai para a chave de instalação abaixo */
    }
  }
  const daInstalacao = chaveDePlataforma(provider);
  if (daInstalacao) return { provider, model, apiKey: daInstalacao };
  return null;
}

/**
 * Resolve o cérebro: 1) agente default da org; 2) fallback out-of-the-box com a
 * chave da instalação (Anthropic, senão OpenRouter) e o modelo padrão — assim a
 * IA funciona sem a org precisar configurar nada, usando a chave do self-host.
 */
async function cerebroDaOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<Cerebro | { erro: string }> {
  const doAgente = await cerebroDoAgente(admin, orgId);
  if (doAgente) return doAgente;

  const anthropic = chaveDePlataforma("anthropic");
  if (anthropic) return { provider: "anthropic", model: MODELO_PADRAO, apiKey: anthropic };

  const openrouter = chaveDePlataforma("openrouter");
  if (openrouter) return { provider: "openrouter", model: `anthropic/${MODELO_PADRAO}`, apiKey: openrouter };

  return { erro: "nenhuma IA configurada nesta instalação" };
}

export async function gerarEncaminhamento(demandaId: string): Promise<ResultadoEncaminhamento> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  const admin = createAdminClient();

  const { data: d } = await admin
    .from("demandas")
    .select("assunto, pol_tipo, pol_orgao_destino, pol_prioridade, contacts(name)")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (!d) return { ok: false, erro: "Demanda não encontrada." };

  const cerebro = await cerebroDaOrg(admin, org.orgId);
  if ("erro" in cerebro) {
    return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };
  }

  const contato = (d as { contacts?: { name?: string | null } | null }).contacts;
  const demandante = contato?.name ?? "o cidadão";
  const assunto = (d.assunto as string | null) ?? "(sem assunto)";
  const tipo = (d.pol_tipo as string | null)?.replace(/_/g, " ") ?? "demanda";
  const orgao = (d.pol_orgao_destino as string | null) ?? "ao órgão competente";
  const prioridade = (d.pol_prioridade as string | null) ?? "normal";

  const system =
    "Você é assessor(a) de gabinete parlamentar no Brasil. Redige ofícios de encaminhamento " +
    "formais, objetivos e cordiais, em português do Brasil, dirigidos a órgãos públicos. " +
    "Não use saudações exageradas, não invente dados, números de processo ou nomes de autoridades. " +
    "Escreva apenas o corpo do encaminhamento, pronto para revisão.";

  const prompt =
    `Redija um encaminhamento oficial curto (2 a 3 parágrafos) da seguinte demanda de cidadão, ` +
    `para ser enviado ${orgao.startsWith("à") || orgao.startsWith("ao") ? orgao : `à ${orgao}`}.\n\n` +
    `Demandante: ${demandante}\n` +
    `Assunto: ${assunto}\n` +
    `Natureza: ${tipo}\n` +
    `Prioridade: ${prioridade}\n\n` +
    `Encaminhe a solicitação, contextualize de forma objetiva e peça a devida análise/providência. ` +
    `Devolva somente o texto do encaminhamento.`;

  try {
    const { text } = await generateText({
      model: buildModel(cerebro.provider, cerebro.apiKey, cerebro.model),
      system,
      prompt,
      // Teto baixo: são poucos parágrafos. Evita queimar crédito do tenant.
      maxOutputTokens: 600,
    });
    const texto = text.trim();
    if (!texto) return { ok: false, erro: "A IA não retornou texto. Tente novamente." };
    return { ok: true, texto };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente novamente em instantes." };
  }
}

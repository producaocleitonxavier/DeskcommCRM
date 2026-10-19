/**
 * Resolve o "cérebro" de IA de uma organização para chamadas one-shot (sem
 * agente/loop): provider + model + apiKey, usando o agente default publicado da
 * org (BYOK ou chave da instalação) e, se não houver, a chave do self-host.
 *
 * Extraído de app/actions/politico/gerarEncaminhamento.ts para ser reaproveitado
 * por outras leituras de IA do War Room (ex.: análise estratégica da Arena).
 * Sem env nova; degrada com mensagem em PT quando a org não tem IA configurada.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { buildModel, chaveDePlataforma } from "@/lib/ai/runtime/agent";
import { loadCredential } from "@/lib/ai/credentials";

// Modelo padrão da plataforma (era o AGENT_DEFAULT_MODEL do produto). Usado no
// fallback out-of-the-box quando a org ainda não configurou um agente de IA.
export const MODELO_PADRAO = "claude-sonnet-4-5";

export type Cerebro = { provider: string; model: string; apiKey: string };

type Admin = ReturnType<typeof createAdminClient>;

/** Tenta resolver pelo agente default publicado da org (BYOK ou chave de instalação). */
async function cerebroDoAgente(admin: Admin, orgId: string): Promise<Cerebro | null> {
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
export async function cerebroDaOrg(admin: Admin, orgId: string): Promise<Cerebro | { erro: string }> {
  const doAgente = await cerebroDoAgente(admin, orgId);
  if (doAgente) return doAgente;

  const anthropic = chaveDePlataforma("anthropic");
  if (anthropic) return { provider: "anthropic", model: MODELO_PADRAO, apiKey: anthropic };

  const openrouter = chaveDePlataforma("openrouter");
  if (openrouter) return { provider: "openrouter", model: `anthropic/${MODELO_PADRAO}`, apiKey: openrouter };

  return { erro: "nenhuma IA configurada nesta instalação" };
}

/** Atalho: constrói o LanguageModel a partir do cérebro resolvido. */
export function modeloDoCerebro(cerebro: Cerebro) {
  return buildModel(cerebro.provider, cerebro.apiKey, cerebro.model);
}

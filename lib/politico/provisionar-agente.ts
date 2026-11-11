/**
 * Provisiona o AGENTE DE IA do mandato a partir do que o assistente de setup já
 * gerou (`settings.gabinete.mandato_gerado`: prompt + conhecimento). Fecha o
 * buraco "o assistente GERA e ninguém LÊ": o político responde 5 perguntas e sai
 * com um agente PRONTO, sem nunca ver a tela de configuração de agente.
 *
 * ESTADO EM QUE O AGENTE NASCE (decisão do cliente, 11/nov): PUBLICADO, mas em
 * MODO ASSISTIDO — existe, aparece e pode ser usado, porém NÃO responde sozinho:
 * nasce com `is_active=false`, `operation_mode='assisted'` e SEM canal. O operador
 * ainda liga o automático e conecta o número (padrão "Número conectado + Publicar").
 * Respeita a trava de autonomia: ninguém fala com eleitor automaticamente sem a
 * decisão explícita do gabinete.
 *
 * Espelha o padrão provado de `lib/prospecting/agent-setup.ts` (criar versão →
 * publishAgentVersion com `expectedProvenance:"onboarding"`), mas sem canal nem
 * roteador e sem `operation_mode='automatic'`.
 *
 * Embute também um TETO DE IA padrão em modo "avisar" (protege o gasto sem cortar
 * o atendimento) quando o gabinete ainda não tem um.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { publishAgentVersion } from "@/lib/ai/agents/publish";
import { chaveDePlataforma } from "@/lib/ai/runtime/agent";
import { versionCreateSchema } from "@/lib/ai/agents/validation";
import { BUCKET_DE_CONHECIMENTO } from "@/lib/ai/rag/ingest/documento";
import { logger } from "@/lib/logger";

/** Provedores com chave de PLATAFORMA (a instalação pode responder sem BYOK). */
const PROVEDORES_DE_PLATAFORMA = ["anthropic", "openai", "openrouter"] as const;
/**
 * Modelo-padrão por provedor, para quando HÁ chave de plataforma mas o catálogo
 * `ai_models` está vazio/incompleto (ex.: ambiente novo). O par é válido em
 * `validarParProvedorModelo` e tem preço em `pricing.ts`. Sem isso, um ambiente
 * sem catálogo não provisiona o agente (motivo "sem_modelo").
 */
const MODELO_PADRAO_POR_PROVEDOR: Record<string, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.4-mini",
  openrouter: "anthropic/claude-sonnet-5",
};
/** O pacote "Atender o cidadão" — o que faz a IA REGISTRAR demanda, não só conversar. */
const TOOLS_DO_GABINETE = ["crm_registrar_demanda", "crm_listar_demandas_cidadao"];
/** Teto padrão do gabinete: US$50/mês, modo "avisar" (avisa e segue, nunca corta). */
const TETO_PADRAO_USD_CENTS = 5000;

export type ResultadoProvisionamento =
  | { ok: true; agentId: string; versionId: string; indexando: boolean }
  | { ok: false; motivo: string };

interface EntradaProvisionamento {
  orgId: string;
  userId: string;
  nomeMandato: string | null;
  prompt: string;
  conhecimento: string;
}

interface ModeloEscolhido {
  provider: string;
  model: string;
  credentialId: string | null;
}

/**
 * Escolhe um par (provedor, modelo) utilizável, na mesma ordem do resolvedor da
 * prospecção: (1) reusar o de um agente já publicado; (2) chave de plataforma;
 * (3) credencial própria da org. `null` quando não há como responder.
 */
async function escolherModelo(admin: SupabaseClient, orgId: string): Promise<ModeloEscolhido | null> {
  // (1) Um agente já publicado garante par válido + credencial boa.
  const { data: pub } = await admin
    .from("ai_agent_versions")
    .select("provider, model, credential_id")
    .eq("organization_id", orgId)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  if (pub?.provider && pub?.model) {
    return { provider: pub.provider as string, model: pub.model as string, credentialId: (pub.credential_id as string | null) ?? null };
  }

  const escolherDoProvedor = async (provider: string): Promise<string | null> => {
    const { data: models } = await admin
      .from("ai_models")
      .select("model_id, is_default_for_provider")
      .eq("provider", provider)
      .eq("supports_tools", true)
      .is("deprecated_at", null);
    if (!models?.length) return null;
    const padrao = models.find((m) => m.is_default_for_provider) ?? models[0];
    return (padrao?.model_id as string | undefined) ?? null;
  };

  // (2) Chave de plataforma (a instalação paga). Se o catálogo não trouxer
  // modelo, cai no padrão do provedor — para um ambiente sem catálogo ainda
  // conseguir provisionar.
  for (const provider of PROVEDORES_DE_PLATAFORMA) {
    if (!chaveDePlataforma(provider)) continue;
    const model = (await escolherDoProvedor(provider)) ?? MODELO_PADRAO_POR_PROVEDOR[provider];
    if (model) return { provider, model, credentialId: null };
  }

  // (3) Credencial própria da org (BYOK).
  const { data: creds } = await admin
    .from("ai_provider_credentials")
    .select("id, provider")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .not("validated_at", "is", null)
    .order("created_at", { ascending: true });
  for (const cred of creds ?? []) {
    const model = await escolherDoProvedor(cred.provider as string);
    if (model) return { provider: cred.provider as string, model, credentialId: cred.id as string };
  }

  return null;
}

/** Arma um teto de IA padrão (modo "avisar") quando o gabinete ainda não tem um. No-op se já existe. */
async function armarTetoPadrao(admin: SupabaseClient, orgId: string): Promise<void> {
  try {
    const { data: existe } = await admin
      .from("ai_budgets")
      .select("organization_id")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (existe) return; // respeita um teto que o admin já configurou
    await admin.from("ai_budgets").insert({
      organization_id: orgId,
      monthly_limit_cents: TETO_PADRAO_USD_CENTS,
      enforcement_mode: "avisar",
      alarm_threshold_pct: 80,
      enforcement_effective_at: new Date().toISOString(),
    });
  } catch (err) {
    // Não fatal: o teto é defesa em profundidade, não pode impedir o provisionamento.
    logger.warn("provisionar-agente: armar teto padrão falhou (não bloqueia)", {
      organization_id: orgId,
      causa: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Cria a base de conhecimento + o agente + a versão v1, publica em modo
 * assistido e arma o teto padrão. Idempotência fica a cargo do chamador (grava o
 * agente criado em `settings.gabinete.mandato_gerado.agente_id`).
 */
export async function provisionarAgenteDoMandato(
  admin: SupabaseClient,
  entrada: EntradaProvisionamento,
): Promise<ResultadoProvisionamento> {
  const { orgId, userId, nomeMandato, prompt, conhecimento } = entrada;
  if (!prompt.trim() || !conhecimento.trim()) return { ok: false, motivo: "conteudo_vazio" };

  const modelo = await escolherModelo(admin, orgId);
  if (!modelo) return { ok: false, motivo: "sem_modelo" };

  // 1) Base de conhecimento: o Markdown gerado vira .md no bucket + fonte + evento.
  const blobPath = `${orgId}/${randomUUID()}.md`;
  const { error: upErr } = await admin.storage
    .from(BUCKET_DE_CONHECIMENTO)
    .upload(blobPath, Buffer.from(conhecimento, "utf8"), { contentType: "text/markdown", upsert: false });
  if (upErr) return { ok: false, motivo: "erro_ao_guardar_conhecimento" };

  const nomeFonte = `Mandato${nomeMandato ? ` — ${nomeMandato}` : ""}`.slice(0, 120);
  const { data: ks, error: ksErr } = await admin
    .from("ai_knowledge_sources")
    .insert({
      organization_id: orgId,
      agent_id: null,
      source_type: "documento",
      name: nomeFonte,
      status: "ready",
      is_active: true,
      source_metadata: { blob_path: blobPath, ext: "md", origem: "mandato_gerado" },
      ingested_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (ksErr || !ks) return { ok: false, motivo: "erro_ao_criar_conhecimento" };
  const ksId = (ks as { id: string }).id;

  await admin.rpc("emit_event" as never, {
    p_event_type: "knowledge_source.updated",
    p_entity_kind: "ai_knowledge_source",
    p_entity_id: ksId,
    p_payload: { knowledge_source_id: ksId, agent_id: null, source_type: "documento" },
    p_organization_id: orgId,
  } as never);

  // 2) Agente + versão v1 (rascunho), em modo ASSISTIDO e sem canal.
  const v = versionCreateSchema.parse({
    system_prompt: prompt,
    provider: modelo.provider,
    model: modelo.model,
    credential_id: modelo.credentialId,
    channel_session_id: null,
    tool_ids: TOOLS_DO_GABINETE,
    knowledge_source_ids: [ksId],
    handoff_tool_enabled: true,
    trigger_config: {
      events: ["message"],
      filters: { ignore_groups: true, ignore_self: true, keyword_regex: null, business_hours: null },
      concurrency: "one_per_conversation",
    },
  });

  const nomeAgente = `IA do Mandato${nomeMandato ? ` — ${nomeMandato}` : ""}`.slice(0, 120);
  const { data: agentRow, error: agentErr } = await admin
    .from("ai_agents")
    .insert({
      organization_id: orgId,
      name: nomeAgente,
      description: "Agente do mandato gerado pelo assistente de configuração.",
      model: v.model,
      system_prompt: v.system_prompt,
      kind: "mcp_agent",
      priority: 100,
      is_active: false,
      is_default: false,
      operation_mode: "assisted",
      created_by: userId,
    })
    .select("id")
    .single();
  if (agentErr || !agentRow) return { ok: false, motivo: "erro_ao_criar_agente" };
  const agentId = (agentRow as { id: string }).id;

  const { data: versionRow, error: versionErr } = await admin
    .from("ai_agent_versions")
    .insert({
      organization_id: orgId,
      agent_id: agentId,
      version_number: 1,
      system_prompt: v.system_prompt,
      provider: v.provider,
      model: v.model,
      credential_id: v.credential_id,
      tool_ids: v.tool_ids,
      trigger_config: v.trigger_config ?? undefined,
      channel_session_id: v.channel_session_id,
      max_steps: v.max_steps,
      token_budget: v.token_budget,
      cost_budget_cents: v.cost_budget_cents,
      history_message_window: v.history_message_window,
      history_token_window: v.history_token_window,
      handoff_keywords: v.handoff_keywords,
      handoff_tool_enabled: v.handoff_tool_enabled,
      handoff_legal_enabled: v.handoff_legal_enabled,
      proposal_ai_draft_enabled: v.proposal_ai_draft_enabled,
      cases_enabled: v.cases_enabled,
      split_messages: v.split_messages,
      split_max_chars: v.split_max_chars,
      inbound_debounce_ms: v.inbound_debounce_ms ?? null,
      followup: v.followup,
      operator_enabled: v.operator_enabled,
      operator_model: v.operator_model,
      operator_tool_ids: v.operator_tool_ids,
      pipeline_ids: v.pipeline_ids,
      knowledge_source_ids: v.knowledge_source_ids,
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single();
  if (versionErr || !versionRow) {
    // Compensa: arquiva o agente recém-criado para não deixar lixo.
    await admin.from("ai_agents").update({ archived_at: new Date().toISOString() }).eq("id", agentId).eq("organization_id", orgId);
    return { ok: false, motivo: "erro_ao_criar_versao" };
  }
  const versionId = (versionRow as { id: string }).id;

  // 3) Publica em modo assistido — caminho de onboarding (sem ator), já previsto.
  const pub = await publishAgentVersion(admin, {
    orgId,
    agentId,
    versionId,
    expectedProvenance: "onboarding",
  });
  if (!pub.ok) {
    return { ok: false, motivo: `erro_ao_publicar:${pub.code}` };
  }

  // 4) Teto padrão (defesa de custo) — não fatal.
  await armarTetoPadrao(admin, orgId);

  void audit({
    action: "ai_agent.created",
    actorUserId: userId,
    organizationId: orgId,
    resourceType: "ai_agent",
    resourceId: agentId,
    metadata: { source: "mandato_setup", version_id: versionId, assistido: true },
  });

  // A indexação do RAG depende de chave de embedding; o evento já foi emitido.
  return { ok: true, agentId, versionId, indexando: true };
}

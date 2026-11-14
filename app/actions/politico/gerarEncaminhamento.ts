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

import { autenticarComPapel } from "@/lib/politico/acesso";
import { generateText } from "ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildModel, chaveDePlataforma } from "@/lib/ai/runtime/agent";
import { loadCredential } from "@/lib/ai/credentials";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import {
  PADRAO_DO_OFICIO,
  instrucoesDoRequerimento,
  limparTextoOficial,
  montarPedidoDoOficio,
  montarPedidoDoRequerimento,
  type TipoDeRequerimento,
} from "@/lib/politico/redacao-oficial";

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
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  const admin = createAdminClient();

  const { data: d } = await admin
    .from("demandas")
    .select("assunto, pol_tipo, pol_orgao_destino, pol_prioridade, pol_oficio_destinatario, contacts(name, custom_fields)")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (!d) return { ok: false, erro: "Demanda não encontrada." };

  const cerebro = await cerebroDaOrg(admin, org.orgId);
  if ("erro" in cerebro) {
    return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };
  }

  const contato = (d as { contacts?: { name?: string | null; custom_fields?: unknown } | null }).contacts;
  const endereco = (contato?.custom_fields as { endereco_gip?: { bairro?: unknown } } | null | undefined)?.endereco_gip;
  const bairro = typeof endereco?.bairro === "string" ? endereco.bairro : null;
  const prioridade = (d.pol_prioridade as string | null) ?? "normal";

  // O que o gabinete já registrou sobre o caso é a fonte dos fatos do ofício.
  // Ficam de fora os eventos que só contam o andamento (aviso enviado, ofício emitido).
  const SO_ANDAMENTO = new Set(["cidadao_avisado", "oficio_emitido", "estado_alterado"]);
  const [{ data: eventos }, { data: ident }, { data: visita }] = await Promise.all([
    admin
      .from("pol_demanda_eventos")
      .select("tipo, descricao, created_at")
      .eq("organization_id", org.orgId)
      .eq("demanda_id", demandaId)
      .order("created_at", { ascending: true })
      .limit(40),
    admin.from("pol_gabinete_config").select("cidade").eq("organization_id", org.orgId).maybeSingle(),
    // Colunas do relato de visita podem não existir numa instalação antiga: segue sem elas.
    admin.from("demandas").select("pol_visita_relato").eq("organization_id", org.orgId).eq("id", demandaId).maybeSingle(),
  ]);
  const relatos = [
    ...((eventos ?? []) as { tipo: string | null; descricao: string | null }[])
      .filter((e) => !SO_ANDAMENTO.has(String(e.tipo ?? "")))
      .map((e) => e.descricao ?? ""),
    (visita as { pol_visita_relato?: string | null } | null)?.pol_visita_relato ?? "",
  ].filter((r) => r.trim().length > 0);

  const system = PADRAO_DO_OFICIO;
  const prompt =
    montarPedidoDoOficio({
      demandante: contato?.name ?? null,
      bairro,
      assunto: (d.assunto as string | null) ?? "(sem assunto)",
      tipo: (d.pol_tipo as string | null)?.replace(/_/g, " ") ?? null,
      orgao: (d.pol_orgao_destino as string | null) ?? null,
      destinatario: (d.pol_oficio_destinatario as string | null)?.trim() || null,
      cidade: (ident as { cidade?: string | null } | null)?.cidade ?? null,
      relatos,
    }) + (prioridade === "urgente" || prioridade === "alta" ? "Prioridade registrada pelo gabinete: " + prioridade + "\n" : "");

  try {
    const { text } = await generateText({
      model: buildModel(cerebro.provider, cerebro.apiKey, cerebro.model),
      system,
      prompt,
      // Teto baixo: é uma página. Evita queimar crédito do tenant.
      maxOutputTokens: 900,
    });
    const texto = limparTextoOficial(text);
    if (!texto) return { ok: false, erro: "A IA não retornou texto. Tente novamente." };
    return { ok: true, texto };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente novamente em instantes." };
  }
}

export type PedidoDeRequerimento = {
  tipo: TipoDeRequerimento;
  /** Comissão a que se requer, como o gabinete escreve. */
  comissao?: string;
  /** Dispositivo do regimento da Casa (ex.: "art. 48 do Regimento Interno"). */
  dispositivo?: string;
};

/**
 * Redige o REQUERIMENTO DE COMISSÃO (visita técnica ou audiência pública) a
 * partir de uma visita/demanda do gabinete. Só devolve o texto, para a equipe
 * revisar e levar ao sistema da Casa — não grava nem envia nada.
 */
export async function gerarRequerimentoDeComissao(
  demandaId: string,
  pedido: PedidoDeRequerimento,
): Promise<ResultadoEncaminhamento> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const tipo: TipoDeRequerimento = pedido?.tipo === "audiencia_publica" ? "audiencia_publica" : "visita_tecnica";
  const curto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

  const admin = createAdminClient();
  const { data: d } = await admin
    .from("demandas")
    .select("assunto, pol_orgao_destino, pol_municipio, prazo_em")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (!d) return { ok: false, erro: "Visita não encontrada." };

  const cerebro = await cerebroDaOrg(admin, org.orgId);
  if ("erro" in cerebro) {
    return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };
  }

  const [{ data: eventos }, { data: ident }, { data: visita }] = await Promise.all([
    admin
      .from("pol_demanda_eventos")
      .select("tipo, descricao, created_at")
      .eq("organization_id", org.orgId)
      .eq("demanda_id", demandaId)
      .order("created_at", { ascending: true })
      .limit(40),
    admin.from("pol_gabinete_config").select("cidade").eq("organization_id", org.orgId).maybeSingle(),
    admin.from("demandas").select("pol_visita_relato").eq("organization_id", org.orgId).eq("id", demandaId).maybeSingle(),
  ]);
  const SO_ANDAMENTO = new Set(["cidadao_avisado", "oficio_emitido", "estado_alterado"]);
  const relatos = [
    ...((eventos ?? []) as { tipo: string | null; descricao: string | null }[])
      .filter((e) => !SO_ANDAMENTO.has(String(e.tipo ?? "")))
      .map((e) => e.descricao ?? ""),
    (visita as { pol_visita_relato?: string | null } | null)?.pol_visita_relato ?? "",
  ].filter((r) => r.trim().length > 0);

  const prazo = d.prazo_em ? new Date(d.prazo_em as string) : null;
  const quando =
    prazo && !Number.isNaN(prazo.getTime())
      ? `${prazo.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}, ` +
        `${prazo.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" })}, às ` +
        `${prazo.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`
      : null;
  const orgao = curto(d.pol_orgao_destino);

  try {
    const { text } = await generateText({
      model: buildModel(cerebro.provider, cerebro.apiKey, cerebro.model),
      system: instrucoesDoRequerimento(tipo),
      prompt: montarPedidoDoRequerimento({
        tipo,
        assunto: (d.assunto as string | null) ?? "(sem assunto)",
        // O endereço do ponto de encontro não é um campo da visita: sai como lacuna
        // para a equipe preencher (ou do relato, se estiver lá).
        local: null,
        quando,
        comissao: curto(pedido?.comissao) || null,
        dispositivo: curto(pedido?.dispositivo) || null,
        convidados: orgao ? [orgao] : [],
        cidade: curto(d.pol_municipio) || ((ident as { cidade?: string | null } | null)?.cidade ?? null),
        relatos,
      }),
      maxOutputTokens: 1200,
    });
    const texto = limparTextoOficial(text);
    if (!texto) return { ok: false, erro: "A IA não retornou texto. Tente novamente." };
    return { ok: true, texto };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente novamente em instantes." };
  }
}

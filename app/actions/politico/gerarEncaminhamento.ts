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
import { buildModel } from "@/lib/ai/runtime/agent";
import { cerebroDaOrg } from "@/lib/politico/cerebro-da-org";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import {
  PADRAO_DO_OFICIO,
  limparTextoOficial,
  montarPedidoDoOficio,
} from "@/lib/politico/redacao-oficial";

export type ResultadoEncaminhamento = { ok: true; texto: string } | { ok: false; erro: string };

/** Local da ocorrência e protocolo no órgão (migration 9098). Sem as colunas, devolve vazio. */
async function localEProtocoloDaDemanda(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  demandaId: string,
): Promise<{ local: string | null; protocolo: string | null }> {
  const { data } = await admin
    .from("demandas")
    .select("pol_local_ocorrencia, pol_protocolo_orgao")
    .eq("organization_id", orgId)
    .eq("id", demandaId)
    .maybeSingle();
  const linha = data as { pol_local_ocorrencia?: string | null; pol_protocolo_orgao?: string | null } | null;
  return {
    local: linha?.pol_local_ocorrencia?.trim() || null,
    protocolo: linha?.pol_protocolo_orgao?.trim() || null,
  };
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
  const { local, protocolo } = await localEProtocoloDaDemanda(admin, org.orgId, demandaId);
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
      local,
      protocolo,
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

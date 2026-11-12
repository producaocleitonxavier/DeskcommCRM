/**
 * ANEXAR um material de conhecimento ao agente do mandato — do jeito que o
 * produto exige.
 *
 * O defeito que isto conserta (achado em 12/nov no primeiro uso real do
 * "Aprofundar o mandato"): o código fazia `update knowledge_source_ids` na versão
 * mais recente do agente. Quando essa versão é a PUBLICADA, o banco recusa — o
 * conteúdo de versão publicada é imutável (`fn_ai_agent_version_content_immutable`,
 * que cobre `knowledge_source_ids`). O erro era engolido: o material ficava
 * gravado e indexado, a tela dizia "acrescentado", e o agente nunca o consultava.
 *
 * O caminho certo é o mesmo do "reverter" do produto: versão publicada não se
 * edita — cria-se uma versão NOVA idêntica, com o material a mais, e publica.
 * Rascunho (que é editável) recebe o material no lugar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { versionPayloadFrom } from "@/lib/ai/agents/duplicate";
import { publishAgentVersion } from "@/lib/ai/agents/publish";

export interface VersaoResumo {
  id: string;
  version_number: number;
  status: string;
  knowledge_source_ids: string[] | null;
}

export type PlanoDeAnexo =
  /** Nada a fazer: quem atende já consulta o material. */
  | { tipo: "ja_anexado" }
  /** Sem versão publicada: o rascunho é editável, entra nele. */
  | { tipo: "editar_rascunho"; versaoId: string }
  /** Há versão publicada sem o material: clonar + publicar (e alinhar o rascunho mais novo, se houver). */
  | { tipo: "nova_versao"; origemId: string; rascunhoParaAlinharId: string | null }
  | { tipo: "sem_versao" };

/** Decide O QUE fazer (puro). `versoes` = todas as versões do agente. */
export function planejarAnexo(versoes: readonly VersaoResumo[], materialId: string): PlanoDeAnexo {
  if (versoes.length === 0) return { tipo: "sem_versao" };
  const tem = (v: VersaoResumo) => (v.knowledge_source_ids ?? []).includes(materialId);
  const publicada = versoes.find((v) => v.status === "published") ?? null;
  const rascunhos = versoes.filter((v) => v.status === "draft").sort((a, b) => b.version_number - a.version_number);
  const rascunho = rascunhos[0] ?? null;

  if (!publicada) {
    if (!rascunho) return { tipo: "sem_versao" };
    return tem(rascunho) ? { tipo: "ja_anexado" } : { tipo: "editar_rascunho", versaoId: rascunho.id };
  }
  if (tem(publicada)) return { tipo: "ja_anexado" };
  // Rascunho mais novo que a publicada e ainda sem o material: alinha, para a
  // próxima publicação do dono não "esquecer" o que ele aprovou.
  const alinhar = rascunho && rascunho.version_number > publicada.version_number && !tem(rascunho) ? rascunho.id : null;
  return { tipo: "nova_versao", origemId: publicada.id, rascunhoParaAlinharId: alinhar };
}

export type ResultadoAnexo =
  | { ok: true; como: "ja_anexado" | "rascunho" | "nova_versao_publicada"; versaoId?: string }
  | { ok: false; motivo: string };

/** Executa o plano. Nunca lança; devolve o motivo quando não anexou. */
export async function anexarMaterialAoAgente(
  admin: SupabaseClient,
  p: { orgId: string; agenteId: string; materialId: string; userId: string | null },
): Promise<ResultadoAnexo> {
  try {
    const { data: lista, error } = await admin
      .from("ai_agent_versions")
      .select("id, version_number, status, knowledge_source_ids")
      .eq("organization_id", p.orgId)
      .eq("agent_id", p.agenteId);
    if (error) return { ok: false, motivo: `ler_versoes: ${error.message}` };
    const versoes = (lista ?? []) as VersaoResumo[];
    const plano = planejarAnexo(versoes, p.materialId);

    if (plano.tipo === "sem_versao") return { ok: false, motivo: "agente_sem_versao" };
    if (plano.tipo === "ja_anexado") return { ok: true, como: "ja_anexado" };

    const somar = (id: string) => {
      const v = versoes.find((x) => x.id === id);
      return Array.from(new Set([...(v?.knowledge_source_ids ?? []), p.materialId]));
    };
    const editarRascunho = async (id: string) =>
      admin.from("ai_agent_versions").update({ knowledge_source_ids: somar(id) }).eq("id", id).eq("organization_id", p.orgId).eq("status", "draft");

    if (plano.tipo === "editar_rascunho") {
      const { error: e } = await editarRascunho(plano.versaoId);
      return e ? { ok: false, motivo: `editar_rascunho: ${e.message}` } : { ok: true, como: "rascunho", versaoId: plano.versaoId };
    }

    // nova_versao: copia a publicada inteira e soma o material.
    const { data: origem, error: eOrigem } = await admin
      .from("ai_agent_versions")
      .select("*")
      .eq("id", plano.origemId)
      .eq("organization_id", p.orgId)
      .maybeSingle();
    if (eOrigem || !origem) return { ok: false, motivo: `ler_origem: ${eOrigem?.message ?? "sem linha"}` };
    const src = origem as Record<string, unknown>;

    let novaId: string | null = null;
    for (let tentativa = 0; tentativa < 3 && !novaId; tentativa++) {
      const { data: max } = await admin
        .from("ai_agent_versions")
        .select("version_number")
        .eq("agent_id", p.agenteId)
        .eq("organization_id", p.orgId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const proximo = (((max as { version_number?: number } | null)?.version_number) ?? 0) + 1;
      const { data: criada, error: eIns } = await admin
        .from("ai_agent_versions")
        .insert({
          ...versionPayloadFrom(src),
          // Ouvir áudio/ver imagem acompanham a cópia: sem estas duas a versão nova
          // nasceria no padrão do banco e o agente pararia de entender áudio.
          ...(src.multimodal_input !== undefined ? { multimodal_input: src.multimodal_input } : {}),
          ...(src.video_frames_enabled !== undefined ? { video_frames_enabled: src.video_frames_enabled } : {}),
          knowledge_source_ids: somar(plano.origemId),
          organization_id: p.orgId,
          agent_id: p.agenteId,
          version_number: proximo,
          status: "draft",
          created_by: p.userId,
        })
        .select("id")
        .single();
      if (!eIns && criada) novaId = (criada as { id: string }).id;
      else if (eIns?.code !== "23505") return { ok: false, motivo: `criar_versao: ${eIns?.message ?? "sem linha"}` };
    }
    if (!novaId) return { ok: false, motivo: "conflito_de_versao" };

    const pub = await publishAgentVersion(admin, {
      orgId: p.orgId,
      agentId: p.agenteId,
      versionId: novaId,
      quemPublicou: { actorUserId: p.userId },
    });
    if (!pub.ok) {
      // Não deixa rascunho órfão: a publicada antiga segue atendendo, intacta.
      await admin.from("ai_agent_versions").delete().eq("id", novaId).eq("organization_id", p.orgId).eq("status", "draft");
      return { ok: false, motivo: `publicar: ${pub.code}` };
    }

    if (plano.rascunhoParaAlinharId) await editarRascunho(plano.rascunhoParaAlinharId);
    return { ok: true, como: "nova_versao_publicada", versaoId: novaId };
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : String(err) };
  }
}

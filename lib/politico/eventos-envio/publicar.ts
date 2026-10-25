/**
 * Publicador da máquina de envio de eventos (Fase 2C Fatia 2, peça 3).
 *
 * Idempotente: garante um fluxo de boas-vindas PUBLICADO por material da
 * Biblioteca (link do ebook embutido) e um fluxo de drip mensal publicado,
 * gravando o mapa material→pointer e o drip_pointer_id na config.
 *
 * ⚠️ PUBLICAR ≠ LIGAR. Os fluxos ficam `active` (prontos para inscrição), mas a
 * máquina continua DORMENTE: ninguém é inscrito enquanto `estaArmada()` for false
 * (config `ativo` + número dedicado). A dormência mora na config, não no status
 * do fluxo — assim, ao armar, o envio funciona na hora, sem republicar nada.
 *
 * Rode isto na ATIVAÇÃO (quando o número dedicado conectar) e sempre que a
 * Biblioteca ganhar um ebook novo que deva virar entrega de evento.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { publishFollowupFlowVersion } from "@/lib/followup/publish";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import { logger } from "@/lib/logger";
import {
  montarFluxoBoasVindasEbook,
  montarFluxoDripMensal,
  TOQUES_DRIP_PADRAO,
} from "./fluxos";

export interface PublicarResultado {
  dripPointerId: string | null;
  ebooks: { materialId: string; titulo: string; pointerId: string }[];
  erros: string[];
}

/** Trigger manual (o app inscreve), sem cancelar na resposta — o match_reply precisa rotear. */
const TRIGGER_MANUAL = { kind: "manual" as const, cancel_on_reply: false };

/**
 * Garante um pointer publicado com este nome (unique por org). Cria o rascunho se
 * não existe, reusa se já existe, e publica a versão em cima. Devolve o pointer_id.
 */
async function garantirFluxoPublicado(
  admin: SupabaseClient,
  orgId: string,
  nome: string,
  graph: FlowGraph,
  createdBy: string,
): Promise<string> {
  const { data: criado, error } = await admin
    .from("followup_flow_pointers")
    .insert({
      organization_id: orgId,
      name: nome,
      draft_graph: graph,
      trigger_config: TRIGGER_MANUAL,
      handoff_policy: "pause",
    })
    .select("id")
    .single();

  let pointerId: string;
  if (error) {
    if (error.code !== "23505") throw error; // nome já existe → reusa
    const { data: existente, error: selErr } = await admin
      .from("followup_flow_pointers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", nome)
      .single();
    if (selErr || !existente) throw selErr ?? new Error("pointer_nao_encontrado");
    pointerId = existente.id as string;
  } else {
    pointerId = criado.id as string;
  }

  const pub = await publishFollowupFlowVersion(admin, { orgId, pointerId, graph, createdBy });
  if (!pub.ok) throw new Error(`publish_falhou: ${pub.message}`);
  return pointerId;
}

export async function publicarFluxosEventos(
  admin: SupabaseClient,
  params: { orgId: string; createdBy: string },
): Promise<PublicarResultado> {
  const { orgId, createdBy } = params;
  const resultado: PublicarResultado = { dripPointerId: null, ebooks: [], erros: [] };

  // 1) Drip mensal (um só por org). Textos de rascunho — o gabinete edita depois.
  try {
    const dripPointerId = await garantirFluxoPublicado(
      admin,
      orgId,
      "Eventos · Conteúdo mensal",
      montarFluxoDripMensal({ toques: [...TOQUES_DRIP_PADRAO] }),
      createdBy,
    );
    resultado.dripPointerId = dripPointerId;
    await admin
      .from("pol_eventos_envio_config")
      .upsert(
        { organization_id: orgId, drip_pointer_id: dripPointerId, updated_at: new Date().toISOString() },
        { onConflict: "organization_id" },
      );
  } catch (e) {
    resultado.erros.push(`drip: ${e instanceof Error ? e.message : String(e)}`);
    logger.warn("[eventos-envio] publicar drip falhou", { error: String(e) });
  }

  // 2) Um fluxo de boas-vindas por ebook ativo da Biblioteca (link embutido).
  const { data: materiais } = await admin
    .from("pol_materiais")
    .select("id, titulo, url")
    .eq("organization_id", orgId)
    .eq("ativo", true);

  for (const m of (materiais ?? []) as { id: string; titulo: string; url: string }[]) {
    if (!m.url?.trim()) continue;
    try {
      const pointerId = await garantirFluxoPublicado(
        admin,
        orgId,
        `Eventos · Boas-vindas · ${m.titulo}`,
        montarFluxoBoasVindasEbook({ ebookTitulo: m.titulo, ebookUrl: m.url }),
        createdBy,
      );
      await admin
        .from("pol_eventos_envio_ebook_fluxo")
        .upsert(
          { organization_id: orgId, material_id: m.id, pointer_id: pointerId },
          { onConflict: "organization_id,material_id" },
        );
      resultado.ebooks.push({ materialId: m.id, titulo: m.titulo, pointerId });
    } catch (e) {
      resultado.erros.push(`ebook ${m.titulo}: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("[eventos-envio] publicar ebook falhou", { titulo: m.titulo, error: String(e) });
    }
  }

  return resultado;
}

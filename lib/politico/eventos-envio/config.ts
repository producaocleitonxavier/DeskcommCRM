/**
 * Config da MÁQUINA DE ENVIO de eventos (Fase 2C Fatia 2), por organização.
 *
 * Singleton por org (`pol_eventos_envio_config`, migration 9048). Guarda o
 * interruptor-mestre, o canal dedicado e o ponteiro do drip. A máquina é
 * DORMENTE por padrão: sem linha, ou com `ativo=false`, ou sem canal, nada é
 * enviado — `estaArmada()` é a única porta que o enroll no cadastro consulta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EventosEnvioConfig {
  organizationId: string;
  /** Interruptor-mestre. Nasce false — a máquina não liga sozinha. */
  ativo: boolean;
  /** Sessão de canal do número dedicado (channel_sessions). null até conectar. */
  channelSessionId: string | null;
  /** Fluxo de drip mensal publicado (followup_flow_pointers). null até publicar. */
  dripPointerId: string | null;
}

export const EVENTOS_ENVIO_DORMENTE: Omit<EventosEnvioConfig, "organizationId"> = {
  ativo: false,
  channelSessionId: null,
  dripPointerId: null,
};

export async function lerEventosEnvioConfig(
  db: SupabaseClient,
  orgId: string,
): Promise<EventosEnvioConfig> {
  const { data } = await db
    .from("pol_eventos_envio_config")
    .select("ativo, channel_session_id, drip_pointer_id")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!data) return { organizationId: orgId, ...EVENTOS_ENVIO_DORMENTE };

  const d = data as Record<string, unknown>;
  return {
    organizationId: orgId,
    ativo: d.ativo === true,
    channelSessionId: typeof d.channel_session_id === "string" ? d.channel_session_id : null,
    dripPointerId: typeof d.drip_pointer_id === "string" ? d.drip_pointer_id : null,
  };
}

/**
 * A máquina só envia quando está LIGADA e tem um número dedicado. É a trava que
 * mantém tudo dormente: enquanto isto é false, o enroll no cadastro no-opa e
 * ninguém recebe mensagem — mesmo com os fluxos já publicados.
 */
export function estaArmada(c: EventosEnvioConfig): boolean {
  return c.ativo && !!c.channelSessionId;
}

/** O fluxo de boas-vindas (com ebook embutido) publicado para um material da Biblioteca. */
export async function pointerDoEbook(
  db: SupabaseClient,
  orgId: string,
  materialId: string,
): Promise<string | null> {
  const { data } = await db
    .from("pol_eventos_envio_ebook_fluxo")
    .select("pointer_id")
    .eq("organization_id", orgId)
    .eq("material_id", materialId)
    .maybeSingle();
  const pid = (data as { pointer_id?: unknown } | null)?.pointer_id;
  return typeof pid === "string" ? pid : null;
}

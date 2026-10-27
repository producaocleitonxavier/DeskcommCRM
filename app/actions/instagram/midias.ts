"use server";

/**
 * Lista os posts recentes da conta Instagram conectada, para o SELETOR DE VÍDEOS
 * da automação (o cliente clica em quais vídeos terão captação). A org vem SEMPRE
 * da sessão. Cada item traz `id` = media_id (o mesmo que o webhook manda), capa,
 * legenda e link — tudo que o seletor precisa pra mostrar com a carinha do vídeo.
 */

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { listarMidiasDaConta, type MidiaPropria } from "@/lib/channels/instagram/perfil";

export interface MidiaSelecao {
  id: string;
  tipo: string | null;
  legenda: string | null;
  permalink: string | null;
  thumb: string | null;
  timestamp: string | null;
}

export async function listarMidiasParaSelecao(): Promise<{
  ok: boolean;
  midias?: MidiaSelecao[];
  erro?: string;
}> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida." };

  const midias = await listarMidiasDaConta(org.orgId, 24);
  if (midias === null) {
    return { ok: false, erro: "Instagram não conectado (ou token expirado). Conecte o Instagram primeiro." };
  }

  const enxuto: MidiaSelecao[] = midias.map((m: MidiaPropria) => ({
    id: m.id,
    tipo: m.tipo,
    legenda: m.legenda,
    permalink: m.permalink,
    thumb: m.thumb,
    timestamp: m.timestamp,
  }));
  return { ok: true, midias: enxuto };
}

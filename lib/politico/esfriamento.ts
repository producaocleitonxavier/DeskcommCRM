/**
 * ESFRIAMENTO DO FUNIL — a temperatura reflete o AGORA.
 *
 * O índice de engajamento só AQUECE (sinal é de engajamento). Quem some ESFRIA
 * aqui: um job que roda de tempos em tempos e rebaixa a temperatura de quem
 * ficou inativo — quente→morno após 15 dias sem atividade, morno/quente→frio
 * após 60. SÓ esfria (nunca aquece — isso é do recompute no sinal). O estágio do
 * funil NÃO é tocado (compromisso conquistado não regride; só a temperatura).
 *
 * Opera no conjunto QUENTE/MORNO (pequeno — só os engajados), então é barato.
 * Global (todas as orgs), roda dentro do campaign-worker. FAIL-SOFT: não lança.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

const DIA_MS = 86_400_000;

export async function esfriarInativos(admin: SupabaseClient): Promise<{ esfriados: number }> {
  try {
    const { data } = await admin
      .from("pol_leads")
      .select("id, temperature, contacts!contact_id(last_activity_at)")
      .in("temperature", ["morno", "quente"])
      .limit(2000);

    const agora = Date.now();
    const paraFrio: string[] = [];
    const paraMorno: string[] = [];
    for (const row of (data ?? []) as unknown as Array<{
      id: string;
      temperature: string;
      contacts: { last_activity_at: string | null } | null;
    }>) {
      const la = row.contacts?.last_activity_at;
      const dias = la ? (agora - new Date(la).getTime()) / DIA_MS : Infinity;
      if (dias > 60) paraFrio.push(row.id);
      else if (dias > 15 && row.temperature === "quente") paraMorno.push(row.id);
    }

    let esfriados = 0;
    if (paraFrio.length > 0) {
      await admin.from("pol_leads").update({ temperature: "frio" }).in("id", paraFrio);
      esfriados += paraFrio.length;
    }
    if (paraMorno.length > 0) {
      await admin.from("pol_leads").update({ temperature: "morno" }).in("id", paraMorno);
      esfriados += paraMorno.length;
    }
    return { esfriados };
  } catch (err) {
    logger.warn("esfriamento: rodada falhou", { detail: err instanceof Error ? err.message.slice(0, 160) : "?" });
    return { esfriados: 0 };
  }
}

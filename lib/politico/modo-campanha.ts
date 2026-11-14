/**
 * Lê a chave de campanha da organização (`organizations.settings.gabinete.modo_campanha`).
 *
 * Só serve para o servidor decidir se aceita `voto_certo` vindo de fora (API,
 * ação). A regra pura mora em `lib/politico/niveis.ts`. FECHA NA DÚVIDA: erro de
 * leitura ou organização não encontrada = chave desligada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { modoCampanhaLigado } from "@/lib/politico/niveis";

export async function lerModoCampanha(db: SupabaseClient, organizationId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
    if (error || !data) return false;
    return modoCampanhaLigado((data as { settings?: unknown }).settings);
  } catch {
    return false;
  }
}

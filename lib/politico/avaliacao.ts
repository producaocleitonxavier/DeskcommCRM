/**
 * NOTA DO CIDADÃO — o link público da avaliação de uma demanda.
 *
 * `/avaliar/<token>`: token OPACO por demanda (32 hex), criado na primeira vez
 * que o aviso de resolução/encerramento é montado. A página pública sabe de qual
 * demanda é sem login e sem expor id. Organização SEMPRE passada por quem chama
 * (resolvida da sessão), nunca do corpo.
 *
 * FAIL-SOFT: nunca lança e devolve `null` quando não dá para montar um link
 * utilizável (coluna ainda não criada, URL pública de instalação mal configurada)
 * — o aviso segue sem a pergunta, jamais com link quebrado.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { urlPublicaUsavel } from "@/lib/escalacao/url-publica";

export async function linkDeAvaliacaoDaDemanda(
  admin: SupabaseClient,
  organizationId: string,
  demandaId: string,
): Promise<string | null> {
  try {
    const ler = async () => {
      const { data, error } = await admin
        .from("demandas")
        .select("pol_avaliacao_token, pol_avaliacao_nota")
        .eq("organization_id", organizationId)
        .eq("id", demandaId)
        .maybeSingle();
      if (error) return undefined;
      return (data as { pol_avaliacao_token: string | null; pol_avaliacao_nota: number | null } | null) ?? null;
    };
    const atual = await ler();
    if (!atual) return null;
    // Já avaliou: não pergunta de novo.
    if (atual.pol_avaliacao_nota !== null) return null;

    let token = atual.pol_avaliacao_token;
    if (!token) {
      const novo = randomUUID().replace(/-/g, "");
      // compare-and-set: grava só se ainda está vazio (dois cliques não criam dois tokens).
      await admin
        .from("demandas")
        .update({ pol_avaliacao_token: novo })
        .eq("organization_id", organizationId)
        .eq("id", demandaId)
        .is("pol_avaliacao_token", null);
      token = (await ler())?.pol_avaliacao_token ?? null;
    }
    if (!token) return null;

    const link = `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/avaliar/${token}`;
    return urlPublicaUsavel(link) ? link : null;
  } catch {
    return null;
  }
}

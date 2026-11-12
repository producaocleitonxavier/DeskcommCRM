"use server";

/**
 * Nota do cidadão — o que a TELA do gabinete precisa: o link que vai no aviso
 * (para o texto do modal mostrar exatamente o que será enviado) e a leitura da
 * avaliação já respondida. Organização sempre da sessão.
 */
import { resolveActiveOrg } from "@/lib/auth/server";
import { autenticarComPapel } from "@/lib/politico/acesso";
import { linkDeAvaliacaoDaDemanda } from "@/lib/politico/avaliacao";
import { createAdminClient } from "@/lib/supabase/admin";

export async function obterLinkDeAvaliacao(demandaId: string): Promise<string | null> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  return linkDeAvaliacaoDaDemanda(createAdminClient(), org.orgId, demandaId);
}

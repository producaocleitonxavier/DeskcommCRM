"use server";

/**
 * Liga/desliga o aviso automático ao cidadão na resolução da demanda (ciclo da
 * demanda), para a ORG inteira. O que a chave decide e o default (LIGADO) estão
 * em `lib/politico/aviso-de-resolucao.ts`; aqui só a gravação.
 *
 * ⚠️ SERVICE ROLE COM `organization_id` DE FONTE CONFIÁVEL, como
 * `definirAiDecideDaEmpresa`: pelo client de sessão, o UPDATE de um admin de
 * tenant em `organizations` casa ZERO linhas e devolve sucesso. O id vem de
 * `resolveActiveOrg`, nunca de argumento. `settings` é jsonb compartilhado:
 * ler, mesclar nos dois níveis e gravar preserva o que não é nosso.
 *
 * Gate ADMIN (não manager): é a máquina de relacionamento do gabinete falando
 * com o cidadão por fora — quem decide ligar/desligar é o admin da operação.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAVE_AVISO_RESOLUCAO, CHAVE_GABINETE } from "@/lib/politico/aviso-de-resolucao";

export type ResultadoAvisoResolucao =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "erro_ao_gravar";
    };

export async function definirAvisoDeResolucao(ligar: boolean): Promise<ResultadoAvisoResolucao> {
  // Server Action é endpoint público: o tipo do parâmetro não chega ao servidor.
  const entrada = z.boolean().safeParse(ligar);
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "erro_ao_gravar" };

  const settings = (atual?.settings ?? {}) as Record<string, unknown>;
  const gabinete = (settings[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  const novo = { ...settings, [CHAVE_GABINETE]: { ...gabinete, [CHAVE_AVISO_RESOLUCAO]: entrada.data } };

  const { error } = await admin.from("organizations").update({ settings: novo }).eq("id", org.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "pol_gabinete.aviso_resolucao_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: { ligado: entrada.data },
  });

  revalidatePath("/app/politico/demandas");
  return { ok: true };
}

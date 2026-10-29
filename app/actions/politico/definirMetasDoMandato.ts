"use server";

/**
 * Define as METAS do mandato (prestação de contas): alvos que a equipe quer
 * bater — demandas atendidas, ofícios, obras entregues, tamanho da base. São do
 * MANDATO (total), e a tela mostra o progresso (realizado/meta). Guardado em
 * `organizations.settings.gabinete.metas` (sem migration). Gate ADMIN.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAVE_GABINETE } from "@/lib/politico/aviso-de-resolucao";
import { CHAVE_METAS } from "@/lib/politico/prestacao-contas-dados";

export type ResultadoMetas = { ok: true } | { ok: false; error: string };

// null/0 = sem meta para aquele indicador. Teto generoso para evitar lixo.
const metaSchema = z.object({
  demandas: z.number().int().min(0).max(1_000_000).nullable(),
  oficios: z.number().int().min(0).max(1_000_000).nullable(),
  obras: z.number().int().min(0).max(1_000_000).nullable(),
  base: z.number().int().min(0).max(100_000_000).nullable(),
});

export async function definirMetasDoMandato(entrada: unknown): Promise<ResultadoMetas> {
  const parsed = metaSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "validation_failed" };
  const m = parsed.data;

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
  // 0 vira null (sem meta), para a tela não mostrar progresso contra meta zero.
  const limpa = (v: number | null) => (v && v > 0 ? v : null);
  const metas = { demandas: limpa(m.demandas), oficios: limpa(m.oficios), obras: limpa(m.obras), base: limpa(m.base) };
  const novo = { ...settings, [CHAVE_GABINETE]: { ...gabinete, [CHAVE_METAS]: metas } };

  const { error } = await admin.from("organizations").update({ settings: novo }).eq("id", org.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  revalidatePath("/app/politico/prestacao-contas");
  return { ok: true };
}

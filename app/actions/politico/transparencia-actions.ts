"use server";

/**
 * Ações do Portal da Transparência (Gabinete). O portal é a vitrine pública
 * read-only do mandato (obras/emendas marcadas como públicas). Aqui o operador
 * liga/desliga o portal e vê o link + quantos registros estão públicos.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export interface PortalConfig {
  orgId: string;
  portalAtivo: boolean;
  nomeParlamentar: string | null;
  obrasPublicas: number;
  emendasPublicas: number;
}

export async function obterPortalConfig(): Promise<PortalConfig | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const db = await createClient();

  const [cfgRes, obrasRes, emendasRes] = await Promise.all([
    db.from("pol_gabinete_config").select("portal_ativo, nome_parlamentar").eq("organization_id", org.orgId).maybeSingle(),
    db
      .from("pol_obras")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .eq("visibilidade", "publica")
      .neq("status", "cancelada"),
    db.from("pol_emendas").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("publica", true),
  ]);

  const cfg = (cfgRes.data ?? null) as { portal_ativo?: boolean | null; nome_parlamentar?: string | null } | null;
  return {
    orgId: org.orgId,
    portalAtivo: !!cfg?.portal_ativo,
    nomeParlamentar: cfg?.nome_parlamentar ?? null,
    obrasPublicas: obrasRes.count ?? 0,
    emendasPublicas: emendasRes.count ?? 0,
  };
}

export async function salvarPortalAtivo(ativo: boolean): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  // Garante a linha de config (upsert por organization_id).
  const { error } = await db
    .from("pol_gabinete_config")
    .upsert({ organization_id: org.orgId, portal_ativo: ativo }, { onConflict: "organization_id" });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

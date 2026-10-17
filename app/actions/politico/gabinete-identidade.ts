"use server";

/**
 * Identidade do gabinete (timbre dos ofícios): nome do parlamentar, cargo,
 * subtítulo, cidade de emissão + logo e assinatura. Uma linha por organização
 * (`pol_gabinete_config`). As imagens vivem no bucket privado
 * `gabinete-identidade`; o download é por URL assinada. Tudo no servidor
 * (browser client não vê a sessão → RLS vazia).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

const BUCKET_IDENTIDADE = "gabinete-identidade";

export interface IdentidadeGabinete {
  nome_parlamentar: string | null;
  cargo: string | null;
  subtitulo: string | null;
  cidade: string | null;
  logoUrl: string | null;
  assinaturaUrl: string | null;
}

export type IdentidadeResultado = { ok: true } | { ok: false; erro: string };

async function orgAtiva(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  return org?.orgId ?? null;
}

/** Lê a identidade da org ativa, já com URLs assinadas (1h) das imagens. */
export async function obterIdentidade(): Promise<IdentidadeGabinete> {
  const vazio: IdentidadeGabinete = {
    nome_parlamentar: null,
    cargo: null,
    subtitulo: null,
    cidade: null,
    logoUrl: null,
    assinaturaUrl: null,
  };
  const org = await orgAtiva();
  if (!org) return vazio;
  const db = await createClient();
  const { data } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, subtitulo, cidade, logo_path, assinatura_path")
    .eq("organization_id", org)
    .maybeSingle();
  if (!data) return vazio;
  const row = data as {
    nome_parlamentar: string | null;
    cargo: string | null;
    subtitulo: string | null;
    cidade: string | null;
    logo_path: string | null;
    assinatura_path: string | null;
  };
  const admin = createAdminClient();
  const assinar = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data: s } = await admin.storage.from(BUCKET_IDENTIDADE).createSignedUrl(path, 60 * 60);
    return s?.signedUrl ?? null;
  };
  return {
    nome_parlamentar: row.nome_parlamentar,
    cargo: row.cargo,
    subtitulo: row.subtitulo,
    cidade: row.cidade,
    logoUrl: await assinar(row.logo_path),
    assinaturaUrl: await assinar(row.assinatura_path),
  };
}

/** Grava os campos de texto da identidade (upsert por organização). */
export async function salvarIdentidade(campos: {
  nome_parlamentar?: string;
  cargo?: string;
  subtitulo?: string;
  cidade?: string;
}): Promise<IdentidadeResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from("pol_gabinete_config").upsert(
    {
      organization_id: org,
      nome_parlamentar: campos.nome_parlamentar?.trim() || null,
      cargo: campos.cargo?.trim() || null,
      subtitulo: campos.subtitulo?.trim() || null,
      cidade: campos.cidade?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Remove a imagem (logo ou assinatura): apaga do bucket e limpa o path. */
export async function removerImagemIdentidade(campo: "logo" | "assinatura"): Promise<IdentidadeResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const coluna = campo === "logo" ? "logo_path" : "assinatura_path";
  const db = await createClient();
  const { data } = await db
    .from("pol_gabinete_config")
    .select(coluna)
    .eq("organization_id", org)
    .maybeSingle();
  const path = (data as Record<string, string | null> | null)?.[coluna] ?? null;
  if (path) {
    const admin = createAdminClient();
    await admin.storage.from(BUCKET_IDENTIDADE).remove([path]);
  }
  const { error } = await db
    .from("pol_gabinete_config")
    .update({ [coluna]: null, updated_at: new Date().toISOString() })
    .eq("organization_id", org);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

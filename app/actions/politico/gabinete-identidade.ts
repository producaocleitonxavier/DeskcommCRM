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

/**
 * Margens padrão (mm) do texto sobre o timbrado — espelham ~120/150/70pt.
 * NÃO exportar: este arquivo é "use server" e só pode exportar funções async
 * (Next quebra o build com object export). Usada só aqui dentro.
 */
const TIMBRADO_MARGENS_MM_PADRAO = { topo: 42, base: 53, lados: 25 } as const;

export interface IdentidadeGabinete {
  nome_parlamentar: string | null;
  cargo: string | null;
  subtitulo: string | null;
  cidade: string | null;
  logoUrl: string | null;
  assinaturaUrl: string | null;
  timbradoUrl: string | null;
  timbradoMargemTopoMm: number;
  timbradoMargemBaseMm: number;
  timbradoMargemLadosMm: number;
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
    timbradoUrl: null,
    timbradoMargemTopoMm: TIMBRADO_MARGENS_MM_PADRAO.topo,
    timbradoMargemBaseMm: TIMBRADO_MARGENS_MM_PADRAO.base,
    timbradoMargemLadosMm: TIMBRADO_MARGENS_MM_PADRAO.lados,
  };
  const org = await orgAtiva();
  if (!org) return vazio;
  const db = await createClient();
  const { data } = await db
    .from("pol_gabinete_config")
    .select(
      "nome_parlamentar, cargo, subtitulo, cidade, logo_path, assinatura_path, timbrado_path, timbrado_margem_topo_mm, timbrado_margem_base_mm, timbrado_margem_lados_mm",
    )
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
    timbrado_path: string | null;
    timbrado_margem_topo_mm: number | null;
    timbrado_margem_base_mm: number | null;
    timbrado_margem_lados_mm: number | null;
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
    timbradoUrl: await assinar(row.timbrado_path),
    timbradoMargemTopoMm: row.timbrado_margem_topo_mm ?? TIMBRADO_MARGENS_MM_PADRAO.topo,
    timbradoMargemBaseMm: row.timbrado_margem_base_mm ?? TIMBRADO_MARGENS_MM_PADRAO.base,
    timbradoMargemLadosMm: row.timbrado_margem_lados_mm ?? TIMBRADO_MARGENS_MM_PADRAO.lados,
  };
}

/**
 * Grava a identidade (upsert por organização). Só atualiza as chaves PRESENTES
 * no objeto — assim "Salvar dados" (textos) e "Salvar margens" não se apagam.
 */
export async function salvarIdentidade(campos: {
  nome_parlamentar?: string;
  cargo?: string;
  subtitulo?: string;
  cidade?: string;
  timbrado_margem_topo_mm?: number | null;
  timbrado_margem_base_mm?: number | null;
  timbrado_margem_lados_mm?: number | null;
}): Promise<IdentidadeResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const patch: Record<string, unknown> = { organization_id: org, updated_at: new Date().toISOString() };
  const texto = (v?: string) => (v?.trim() ? v.trim() : null);
  if ("nome_parlamentar" in campos) patch.nome_parlamentar = texto(campos.nome_parlamentar);
  if ("cargo" in campos) patch.cargo = texto(campos.cargo);
  if ("subtitulo" in campos) patch.subtitulo = texto(campos.subtitulo);
  if ("cidade" in campos) patch.cidade = texto(campos.cidade);
  // Margens: inteiro >= 0 ou null (reseta para o padrão). Valor inválido vira null.
  const mm = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  if ("timbrado_margem_topo_mm" in campos) patch.timbrado_margem_topo_mm = mm(campos.timbrado_margem_topo_mm);
  if ("timbrado_margem_base_mm" in campos) patch.timbrado_margem_base_mm = mm(campos.timbrado_margem_base_mm);
  if ("timbrado_margem_lados_mm" in campos) patch.timbrado_margem_lados_mm = mm(campos.timbrado_margem_lados_mm);

  const { error } = await db.from("pol_gabinete_config").upsert(patch, { onConflict: "organization_id" });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Remove a imagem (logo ou assinatura): apaga do bucket e limpa o path. */
export async function removerImagemIdentidade(campo: "logo" | "assinatura" | "timbrado"): Promise<IdentidadeResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const coluna = campo === "logo" ? "logo_path" : campo === "assinatura" ? "assinatura_path" : "timbrado_path";
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

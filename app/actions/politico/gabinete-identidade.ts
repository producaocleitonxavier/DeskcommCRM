"use server";

/**
 * Identidade do gabinete (timbre dos ofícios): nome do parlamentar, cargo,
 * subtítulo, cidade de emissão + logo e assinatura. Uma linha por organização
 * (`pol_gabinete_config`). As imagens vivem no bucket privado
 * `gabinete-identidade`; o download é por URL assinada. Tudo no servidor
 * (browser client não vê a sessão → RLS vazia).
 */

import { autenticarComPapel } from "@/lib/politico/acesso";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { caminhoPertenceAOrg } from "@/lib/storage/caminho-da-org";
import { limparLinhaDeAssinatura, linhasGuardadasDaAssinatura } from "@/lib/politico/assinatura-do-documento";

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
  /** Moldura de Stories Antes&Depois (PNG com 2 janelas transparentes). */
  molduraVitoriaUrl: string | null;
  timbradoMargemTopoMm: number;
  timbradoMargemBaseMm: number;
  timbradoMargemLadosMm: number;
  /** Estilo do ofício (config do gabinete). */
  oficioDestinatarioPosicao: "topo" | "rodape";
  oficioMostrarAssunto: boolean;
  oficioAssinaturaModo: "imagem" | "gov_br";
  /** As duas linhas escritas sob a linha de assinatura (vazias = nome e cargo). */
  assinaturaLinha1: string;
  assinaturaLinha2: string;
}

export type IdentidadeResultado = { ok: true } | { ok: false; erro: string };

async function orgAtiva(): Promise<string | null> {
  const user = await autenticarComPapel("manager");
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
    molduraVitoriaUrl: null,
    timbradoMargemTopoMm: TIMBRADO_MARGENS_MM_PADRAO.topo,
    timbradoMargemBaseMm: TIMBRADO_MARGENS_MM_PADRAO.base,
    timbradoMargemLadosMm: TIMBRADO_MARGENS_MM_PADRAO.lados,
    oficioDestinatarioPosicao: "rodape",
    oficioMostrarAssunto: false,
    oficioAssinaturaModo: "imagem",
    assinaturaLinha1: "",
    assinaturaLinha2: "",
  };
  const org = await orgAtiva();
  if (!org) return vazio;
  const db = await createClient();
  const { data } = await db
    .from("pol_gabinete_config")
    .select(
      "nome_parlamentar, cargo, subtitulo, cidade, logo_path, assinatura_path, timbrado_path, moldura_vitoria_path, timbrado_margem_topo_mm, timbrado_margem_base_mm, timbrado_margem_lados_mm, oficio_destinatario_posicao, oficio_mostrar_assunto, oficio_assinatura_modo",
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
    moldura_vitoria_path: string | null;
    timbrado_margem_topo_mm: number | null;
    timbrado_margem_base_mm: number | null;
    timbrado_margem_lados_mm: number | null;
    oficio_destinatario_posicao: string | null;
    oficio_mostrar_assunto: boolean | null;
    oficio_assinatura_modo: string | null;
  };
  const admin = createAdminClient();
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", org).maybeSingle();
  const linhas = linhasGuardadasDaAssinatura((orgRow as { settings?: unknown } | null)?.settings);
  const assinar = async (path: string | null): Promise<string | null> => {
    if (!caminhoPertenceAOrg(path, org)) return null;
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
    molduraVitoriaUrl: await assinar(row.moldura_vitoria_path),
    timbradoMargemTopoMm: row.timbrado_margem_topo_mm ?? TIMBRADO_MARGENS_MM_PADRAO.topo,
    timbradoMargemBaseMm: row.timbrado_margem_base_mm ?? TIMBRADO_MARGENS_MM_PADRAO.base,
    timbradoMargemLadosMm: row.timbrado_margem_lados_mm ?? TIMBRADO_MARGENS_MM_PADRAO.lados,
    oficioDestinatarioPosicao: row.oficio_destinatario_posicao === "topo" ? "topo" : "rodape",
    oficioMostrarAssunto: row.oficio_mostrar_assunto === true,
    oficioAssinaturaModo: row.oficio_assinatura_modo === "gov_br" ? "gov_br" : "imagem",
    assinaturaLinha1: linhas.linha1,
    assinaturaLinha2: linhas.linha2,
  };
}

/**
 * Grava as duas linhas do bloco de assinatura dos documentos (`settings.gabinete.assinatura_do_documento`).
 * As duas vazias = volta ao padrão (nome e cargo).
 */
export async function salvarTextoDaAssinatura(linha1: string, linha2: string): Promise<IdentidadeResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const admin = createAdminClient();
  const { data, error } = await admin.from("organizations").select("settings").eq("id", org).maybeSingle();
  // Leitura que falhou NUNCA vira base de gravação (regravar a partir de vazio apagaria tudo).
  if (error || !data) return { ok: false, erro: "Não consegui ler as configurações. Tente de novo." };
  const lido = (data as { settings?: unknown }).settings;
  if (lido !== null && lido !== undefined && (typeof lido !== "object" || Array.isArray(lido))) {
    return { ok: false, erro: "As configurações estão num formato inesperado. Avise o suporte." };
  }
  const settings = (lido ?? {}) as Record<string, unknown>;
  const gabinete = (settings.gabinete && typeof settings.gabinete === "object" && !Array.isArray(settings.gabinete) ? settings.gabinete : {}) as Record<string, unknown>;
  const novo = { linha1: limparLinhaDeAssinatura(linha1), linha2: limparLinhaDeAssinatura(linha2) };
  const { error: errGravar } = await admin
    .from("organizations")
    .update({ settings: { ...settings, gabinete: { ...gabinete, assinatura_do_documento: novo } } })
    .eq("id", org);
  if (errGravar) return { ok: false, erro: "Não consegui salvar. Tente de novo." };
  return { ok: true };
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
  oficio_destinatario_posicao?: "topo" | "rodape";
  oficio_mostrar_assunto?: boolean;
  oficio_assinatura_modo?: "imagem" | "gov_br";
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
  if ("oficio_destinatario_posicao" in campos) patch.oficio_destinatario_posicao = campos.oficio_destinatario_posicao === "topo" ? "topo" : "rodape";
  if ("oficio_mostrar_assunto" in campos) patch.oficio_mostrar_assunto = campos.oficio_mostrar_assunto === true;
  if ("oficio_assinatura_modo" in campos) patch.oficio_assinatura_modo = campos.oficio_assinatura_modo === "gov_br" ? "gov_br" : "imagem";

  const { error } = await db.from("pol_gabinete_config").upsert(patch, { onConflict: "organization_id" });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

/** Remove a imagem (logo ou assinatura): apaga do bucket e limpa o path. */
export async function removerImagemIdentidade(campo: "logo" | "assinatura" | "timbrado" | "moldura_vitoria"): Promise<IdentidadeResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const coluna =
    campo === "logo" ? "logo_path"
    : campo === "assinatura" ? "assinatura_path"
    : campo === "timbrado" ? "timbrado_path"
    : "moldura_vitoria_path";
  const db = await createClient();
  const { data } = await db
    .from("pol_gabinete_config")
    .select(coluna)
    .eq("organization_id", org)
    .maybeSingle();
  const path = (data as Record<string, string | null> | null)?.[coluna] ?? null;
  if (caminhoPertenceAOrg(path, org)) {
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

/**
 * Identidade do gabinete para os documentos em PDF (ofício e requerimento):
 * nome, cargo, cidade, logo, assinatura, papel timbrado e margens — lidos de
 * `pol_gabinete_config`, com os arquivos assinados por URL temporária.
 *
 * Um lugar só, para o ofício e o requerimento saírem no MESMO papel. Roda no
 * servidor; `orgId` vem sempre da sessão, nunca do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { marcaDaOrganizacaoParaPdf } from "@/lib/propostas/marca-da-organizacao-para-pdf";
import { linhasDaAssinatura } from "@/lib/politico/assinatura-do-documento";
import { imagemProntaParaPdf } from "@/lib/politico/imagem-para-pdf";
import { caminhoPertenceAOrg } from "@/lib/storage/caminho-da-org";

/** Os campos de `OficioPdfInput` que vêm da identidade do gabinete. */
export type IdentidadeDoOficio = {
  nome: string | null;
  subtitulo: string | null;
  cargo: string | null;
  cidade: string | null;
  assinaturaUrl: string | null;
  assinaturaModo: "imagem" | "gov_br";
  /** As duas linhas sob a linha de assinatura, como o gabinete escolheu (ou nome e cargo). */
  assinaturaLinhas: { linha1: string; linha2: string };
  destinatarioPosicao: "topo" | "rodape";
  timbradoUrl: string | null;
  timbradoMargens: { topo: number | null; base: number | null; lados: number | null };
  marca: { appName: string | null; accentHex: string | null; logoUrl: string | null };
};

// mm → pontos (1mm ≈ 2.8346pt). null = usa o padrão do renderizador.
function mmParaPt(v: number | null | undefined): number | null {
  return typeof v === "number" ? Math.round(v * 2.834645669) : null;
}

/**
 * @param db    cliente da sessão (RLS) — lê a configuração e a marca.
 * @param admin cliente de serviço — só para assinar as URLs do bucket privado.
 */
export async function identidadeDoOficio(
  db: SupabaseClient,
  admin: SupabaseClient,
  orgId: string,
): Promise<IdentidadeDoOficio> {
  const marca = await marcaDaOrganizacaoParaPdf(db, orgId);
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const settings = (orgRow as { settings?: unknown } | null)?.settings;
  const { data: cfg } = await db
    .from("pol_gabinete_config")
    .select(
      "nome_parlamentar, cargo, subtitulo, cidade, logo_path, assinatura_path, timbrado_path, timbrado_margem_topo_mm, timbrado_margem_base_mm, timbrado_margem_lados_mm, oficio_destinatario_posicao, oficio_assinatura_modo",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  const ident = (cfg ?? null) as {
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
    oficio_destinatario_posicao: string | null;
    oficio_assinatura_modo: string | null;
  } | null;

  // PNG/JPG vão por link; WebP (que o PDF não desenha) é convertido na hora — sem isto o
  // documento saía sem o papel timbrado, e sem erro nenhum na tela.
  const assinar = async (p: string | null, uso: "timbrado" | "transparente" = "transparente"): Promise<string | null> => {
    if (!caminhoPertenceAOrg(p, orgId)) return null;
    return imagemProntaParaPdf(admin, "gabinete-identidade", p, uso);
  };
  const [logoProprio, assinaturaUrl, timbradoUrl] = await Promise.all([
    assinar(ident?.logo_path ?? null),
    assinar(ident?.assinatura_path ?? null),
    assinar(ident?.timbrado_path ?? null, "timbrado"),
  ]);

  return {
    nome: ident?.nome_parlamentar ?? null,
    subtitulo: ident?.subtitulo ?? null,
    cargo: ident?.cargo ?? null,
    cidade: ident?.cidade ?? null,
    assinaturaUrl,
    assinaturaModo: ident?.oficio_assinatura_modo === "gov_br" ? "gov_br" : "imagem",
    assinaturaLinhas: linhasDaAssinatura(settings, ident?.nome_parlamentar ?? null, ident?.cargo ?? null),
    destinatarioPosicao: ident?.oficio_destinatario_posicao === "topo" ? "topo" : "rodape",
    timbradoUrl,
    timbradoMargens: {
      topo: mmParaPt(ident?.timbrado_margem_topo_mm),
      base: mmParaPt(ident?.timbrado_margem_base_mm),
      lados: mmParaPt(ident?.timbrado_margem_lados_mm),
    },
    marca: { appName: marca.appName, accentHex: marca.accentHex, logoUrl: logoProprio ?? marca.logoUrl },
  };
}

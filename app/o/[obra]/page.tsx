/**
 * /o/[obra] — página PÚBLICA de captação por obra/entidade (sem auth).
 *
 * A entidade/projeto beneficiado compartilha este link; quem se cadastra entra
 * na base da organização JÁ ATRIBUÍDO à obra. Peça de campanha: o topo é a
 * identidade do mandato; a marca da plataforma desce pequena ao rodapé. Resolve
 * tudo no servidor (admin client). Link inválido → 404.
 */

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { env } from "@/lib/env";
import CaptacaoObraClient from "./_client";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CaptacaoObraPage({ params }: { params: Promise<{ obra: string }> }) {
  const { obra: obraId } = await params;
  if (!UUID.test(obraId)) notFound();

  const admin = createAdminClient();
  const { data: obra } = await admin.from("pol_obras").select("id, titulo, municipio, bairro, organization_id").eq("id", obraId).maybeSingle();
  if (!obra) notFound();
  const o = obra as { id: string; titulo: string; municipio: string | null; bairro: string | null; organization_id: string };

  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, logo_path")
    .eq("organization_id", o.organization_id)
    .maybeSingle();
  const ident = (cfg ?? null) as { nome_parlamentar: string | null; cargo: string | null; logo_path: string | null } | null;
  let logoUrl: string | null = null;
  if (ident?.logo_path) {
    const { data: signed } = await admin.storage.from("gabinete-identidade").createSignedUrl(ident.logo_path, 60 * 60);
    logoUrl = signed?.signedUrl ?? null;
  }

  const linha = await marcaDaInstalacao();
  const plataformaNome = (linha?.app_name ?? env.APP_NAME ?? "").trim() || null;

  return (
    <CaptacaoObraClient
      obraId={o.id}
      obraTitulo={o.titulo}
      cidade={o.municipio}
      bairro={o.bairro}
      politicoNome={(ident?.nome_parlamentar ?? "").trim() || null}
      politicoCargo={(ident?.cargo ?? "").trim() || null}
      logoUrl={logoUrl}
      plataformaNome={plataformaNome}
    />
  );
}

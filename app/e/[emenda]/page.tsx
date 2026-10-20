/**
 * /e/[emenda] — página PÚBLICA de captação por emenda/entidade (sem auth).
 * Espelha /o/[obra]: a entidade beneficiada compartilha o link; quem se cadastra
 * entra na base atribuído à emenda. Topo = identidade do mandato. Link inválido → 404.
 */

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { env } from "@/lib/env";
import CaptacaoEmendaClient from "./_client";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CaptacaoEmendaPage({ params }: { params: Promise<{ emenda: string }> }) {
  const { emenda: emendaId } = await params;
  if (!UUID.test(emendaId)) notFound();

  const admin = createAdminClient();
  const { data: emenda } = await admin.from("pol_emendas").select("id, descricao, entidade_beneficiada, municipio, bairro, organization_id").eq("id", emendaId).maybeSingle();
  if (!emenda) notFound();
  const em = emenda as { id: string; descricao: string | null; entidade_beneficiada: string | null; municipio: string | null; bairro: string | null; organization_id: string };

  const { data: cfg } = await admin.from("pol_gabinete_config").select("nome_parlamentar, cargo, logo_path").eq("organization_id", em.organization_id).maybeSingle();
  const ident = (cfg ?? null) as { nome_parlamentar: string | null; cargo: string | null; logo_path: string | null } | null;
  let logoUrl: string | null = null;
  if (ident?.logo_path) {
    const { data: signed } = await admin.storage.from("gabinete-identidade").createSignedUrl(ident.logo_path, 60 * 60);
    logoUrl = signed?.signedUrl ?? null;
  }
  const linha = await marcaDaInstalacao();
  const plataformaNome = (linha?.app_name ?? env.APP_NAME ?? "").trim() || null;

  return (
    <CaptacaoEmendaClient
      emendaId={em.id}
      projeto={em.entidade_beneficiada || em.descricao || "Projeto"}
      cidade={em.municipio}
      bairro={em.bairro}
      politicoNome={(ident?.nome_parlamentar ?? "").trim() || null}
      politicoCargo={(ident?.cargo ?? "").trim() || null}
      logoUrl={logoUrl}
      plataformaNome={plataformaNome}
    />
  );
}

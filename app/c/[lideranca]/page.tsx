/**
 * /c/[lideranca] — página PÚBLICA de captação por liderança (sem auth).
 *
 * A liderança compartilha este link; quem se cadastra entra na base da
 * organização já atribuído a ela. Resolve a liderança + a identidade do
 * gabinete (nome/logo) SÓ no servidor, via admin client. Link inválido → 404.
 */

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import CaptacaoClient from "./_client";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CaptacaoPublicaPage({ params }: { params: Promise<{ lideranca: string }> }) {
  const { lideranca: liderancaId } = await params;
  if (!UUID.test(liderancaId)) notFound();

  const admin = createAdminClient();
  const { data: lid } = await admin
    .from("pol_liderancas")
    .select("id, nome, apelido, organization_id")
    .eq("id", liderancaId)
    .maybeSingle();
  if (!lid) notFound();
  const l = lid as { id: string; nome: string; apelido: string | null; organization_id: string };

  // Identidade do gabinete para dar cara ao formulário (nome + logo).
  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, logo_path")
    .eq("organization_id", l.organization_id)
    .maybeSingle();
  const ident = (cfg ?? null) as { nome_parlamentar: string | null; logo_path: string | null } | null;
  let logoUrl: string | null = null;
  if (ident?.logo_path) {
    const { data: signed } = await admin.storage.from("gabinete-identidade").createSignedUrl(ident.logo_path, 60 * 60);
    logoUrl = signed?.signedUrl ?? null;
  }

  return (
    <CaptacaoClient
      liderancaId={l.id}
      liderancaNome={l.apelido || l.nome}
      gabineteNome={ident?.nome_parlamentar ?? "Gabinete"}
      logoUrl={logoUrl}
    />
  );
}

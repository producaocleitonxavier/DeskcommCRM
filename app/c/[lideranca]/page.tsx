/**
 * /c/[lideranca] — página PÚBLICA de captação por liderança (sem auth).
 *
 * A liderança compartilha este link; quem se cadastra entra na base da
 * organização já atribuído a ela. O link é uma PEÇA DE CAMPANHA do político:
 * o topo é a identidade do mandato (logo OU nome do parlamentar), e a marca da
 * plataforma (Guerrilheiros) desce pequena para o rodapé. Resolve tudo SÓ no
 * servidor, via admin client. Link inválido → 404.
 */

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { env } from "@/lib/env";
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

  // Identidade do MANDATO (per-cliente): é ela que dá o rosto ao formulário.
  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, logo_path")
    .eq("organization_id", l.organization_id)
    .maybeSingle();
  const ident = (cfg ?? null) as { nome_parlamentar: string | null; cargo: string | null; logo_path: string | null } | null;
  let logoUrl: string | null = null;
  if (ident?.logo_path) {
    const { data: signed } = await admin.storage.from("gabinete-identidade").createSignedUrl(ident.logo_path, 60 * 60);
    logoUrl = signed?.signedUrl ?? null;
  }

  // Marca da PLATAFORMA (Guerrilheiros) — vai pequena no rodapé, nunca no topo.
  const linha = await marcaDaInstalacao();
  const plataformaNome = (linha?.app_name ?? env.APP_NAME ?? "").trim() || null;

  const politicoNome = (ident?.nome_parlamentar ?? "").trim() || null;
  const politicoCargo = (ident?.cargo ?? "").trim() || null;

  return (
    <CaptacaoClient
      liderancaId={l.id}
      liderancaNome={l.apelido || l.nome}
      politicoNome={politicoNome}
      politicoCargo={politicoCargo}
      logoUrl={logoUrl}
      plataformaNome={plataformaNome}
    />
  );
}

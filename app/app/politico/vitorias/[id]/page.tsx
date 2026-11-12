/**
 * /app/politico/vitorias/[id] — Gerador "Antes & Depois" de uma demanda resolvida.
 *
 * Server: auth + carrega a demanda e suas FOTOS (anexos imagem, com URL assinada).
 * Entrega ao client que monta o card (prévia via a rota /card), com legenda da IA
 * (assistida). Acesso: agent+ (gabinete).
 */

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { listarAnexosDemanda } from "@/app/actions/politico/gabinete-actions";
import { CommandHero } from "@/components/politico/command-hero";
import GeradorVitoriaClient from "./_gerador-client";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";

const MIMES_IMAGEM = ["image/jpeg", "image/jpg", "image/png"];

export default async function GerarVitoriaPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirAcessoPolitico("vitorias");
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const { id } = await params;
  const db = await createClient();
  const { data: dem } = await db
    .from("demandas")
    .select("id, assunto, estado, pol_orgao_destino, pol_bairro")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!dem) notFound();

  const anexos = await listarAnexosDemanda(id);
  const fotos = anexos
    .filter((a) => MIMES_IMAGEM.includes(a.media_mime) && a.url)
    .map((a) => ({ id: a.id, url: a.url as string, nome: a.nome_arquivo }));

  return (
    <div className="gip-ambient-bg mx-auto max-w-[920px] px-4 py-7 space-y-5">
      <CommandHero
        eyebrow="Gabinete · Vitórias"
        titulo="Material da vitória"
        subtitulo="Organize o Antes & Depois e a legenda. A comunicação baixa as fotos e monta a arte."
        acoes={[{ href: `/app/politico/demandas/${id}`, label: "← Demanda" }]}
      />
      <GeradorVitoriaClient
        demandaId={id}
        assunto={(dem.assunto as string | null) ?? "Demanda"}
        fotosIniciais={fotos}
      />
    </div>
  );
}

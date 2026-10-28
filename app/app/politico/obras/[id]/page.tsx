import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { listarVistorias, listarFotosObra, obterMandatoTse, pesoBairro, type PesoBairro } from "@/app/actions/politico/obras-actions";
import { lerVozConfig, vozArmada } from "@/lib/voz/config";
import ObraDetalhe, { type ObraDetalheData } from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function ObraDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data: obra } = await db.from("pol_obras").select("*").eq("organization_id", org.orgId).eq("id", id).maybeSingle();
  if (!obra) notFound();
  const o = obra as Record<string, unknown>;

  // Vínculos: emenda (fonte) + território (regional + peso eleitoral do bairro, via intel).
  const emendaId = o.emenda_id as string | null;
  const municipio = (o.municipio as string | null) ?? "";
  const bairro = (o.bairro as string | null) ?? "";

  // tse_code do município (uma vez) e o mandato configurado.
  const [mandato, mun] = await Promise.all([
    obterMandatoTse(),
    municipio ? db.from("intel_municipios").select("tse_code").ilike("nome", municipio).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const tseCode = (mun.data as { tse_code?: string } | null)?.tse_code ?? null;

  const [{ data: emenda }, vistorias, fotos, regional, peso, emendasLista] = await Promise.all([
    emendaId ? db.from("pol_emendas").select("numero, ano, descricao").eq("id", emendaId).maybeSingle() : Promise.resolve({ data: null }),
    listarVistorias(id),
    listarFotosObra(id),
    (async () => {
      if (!tseCode || !bairro) return null;
      const { data: br } = await db.from("intel_bairro_regional").select("regional").eq("cd_municipio", Number(tseCode)).ilike("bairro", bairro).limit(1).maybeSingle();
      return (br as { regional?: string } | null)?.regional ?? null;
    })(),
    (async (): Promise<PesoBairro | null> => {
      if (!mandato || !tseCode || !bairro) return null;
      return pesoBairro(mandato.electionId, mandato.sq, tseCode, bairro);
    })(),
    db.from("pol_emendas").select("id, numero, ano, descricao").eq("organization_id", org.orgId).order("ano", { ascending: false }).limit(200),
  ]);

  const { count: beneficiarios } = await db
    .from("pol_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.orgId)
    .eq("pol_obra_id", id);

  // Voz do Mandato: liga o botão "Recado em áudio" na lista de beneficiários.
  const vozOk = vozArmada(await lerVozConfig(db, org.orgId));
  const { data: gabNome } = await db.from("pol_gabinete_config").select("nome_parlamentar").eq("organization_id", org.orgId).maybeSingle();
  const politicoNome = ((gabNome?.nome_parlamentar as string | null) ?? mandato?.nome ?? "").trim() || null;

  const data: ObraDetalheData = {
    obra: o as ObraDetalheData["obra"],
    beneficiarios: beneficiarios ?? 0,
    emendaRotulo: emenda ? `${(emenda as { numero?: string }).numero ?? "Emenda"}/${(emenda as { ano?: number }).ano} — ${((emenda as { descricao?: string }).descricao ?? "").slice(0, 60)}` : null,
    regional,
    peso,
    mandatoNome: mandato?.nome ?? null,
    temBairro: Boolean(bairro),
    vistorias,
    fotos,
    emendas: (emendasLista.data ?? []) as ObraDetalheData["emendas"],
    vozArmada: vozOk,
    politicoNome,
  };

  return <ObraDetalhe data={data} />;
}

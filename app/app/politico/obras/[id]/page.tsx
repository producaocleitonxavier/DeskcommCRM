import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { listarVistorias } from "@/app/actions/politico/obras-actions";
import { listarFotosObra } from "@/app/actions/politico/obras-actions";
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

  // Vínculos: emenda (fonte) + regional (peso eleitoral do bairro, via intel).
  const emendaId = o.emenda_id as string | null;
  const municipio = (o.municipio as string | null) ?? "";
  const bairro = (o.bairro as string | null) ?? "";
  const [{ data: emenda }, vistorias, fotos, regional, emendasLista] = await Promise.all([
    emendaId ? db.from("pol_emendas").select("numero, ano, descricao").eq("id", emendaId).maybeSingle() : Promise.resolve({ data: null }),
    listarVistorias(id),
    listarFotosObra(id),
    (async () => {
      if (!municipio || !bairro) return null;
      const { data: mun } = await db.from("intel_municipios").select("tse_code").ilike("nome", municipio).limit(1).maybeSingle();
      const tse = (mun as { tse_code?: string } | null)?.tse_code;
      if (!tse) return null;
      const { data: br } = await db.from("intel_bairro_regional").select("regional").eq("cd_municipio", Number(tse)).ilike("bairro", bairro).limit(1).maybeSingle();
      return (br as { regional?: string } | null)?.regional ?? null;
    })(),
    db.from("pol_emendas").select("id, numero, ano, descricao").eq("organization_id", org.orgId).order("ano", { ascending: false }).limit(200),
  ]);

  const data: ObraDetalheData = {
    obra: o as ObraDetalheData["obra"],
    emendaRotulo: emenda ? `${(emenda as { numero?: string }).numero ?? "Emenda"}/${(emenda as { ano?: number }).ano} — ${((emenda as { descricao?: string }).descricao ?? "").slice(0, 60)}` : null,
    regional,
    vistorias,
    fotos,
    emendas: (emendasLista.data ?? []) as ObraDetalheData["emendas"],
  };

  return <ObraDetalhe data={data} />;
}

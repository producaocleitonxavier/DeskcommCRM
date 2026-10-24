/**
 * /app/politico/materiais/[id] — editar/excluir um material (Biblioteca).
 * Server: auth + fetch (pol_materiais). Edição no client via server actions.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import MaterialDetalheClient, { type MaterialDetalhe } from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function MaterialDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data } = await db
    .from("pol_materiais")
    .select("id, titulo, descricao, categoria, tipo, url, capa_url, ativo")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();

  if (!data) redirect("/app/politico/materiais");
  const m = data as Record<string, unknown>;

  const material: MaterialDetalhe = {
    id: String(m.id),
    titulo: String(m.titulo ?? ""),
    descricao: (m.descricao as string | null) ?? "",
    categoria: (m.categoria as string | null) ?? "",
    tipo: String(m.tipo ?? "ebook"),
    url: String(m.url ?? ""),
    capaUrl: (m.capa_url as string | null) ?? "",
    ativo: Boolean(m.ativo),
  };

  return <MaterialDetalheClient material={material} />;
}

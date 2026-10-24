/**
 * /app/politico/materiais — Biblioteca de Materiais (War Room 2.0)
 *
 * Server: auth + fetch (pol_materiais). Visual em ./_materiais-client.
 * É o banco de conteúdos (e-books, PDFs, vídeos, links) que alimenta o nurture
 * e o envio de materiais. Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import MateriaisClient, { type MaterialItem } from "./_materiais-client";

export const dynamic = "force-dynamic";

export default async function MateriaisPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data } = await db
    .from("pol_materiais")
    .select("id, titulo, descricao, categoria, tipo, url, capa_url, ativo, created_at")
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  const materiais: MaterialItem[] = ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    titulo: String(m.titulo ?? ""),
    descricao: (m.descricao as string | null) ?? null,
    categoria: (m.categoria as string | null) ?? null,
    tipo: String(m.tipo ?? "ebook"),
    url: String(m.url ?? ""),
    capaUrl: (m.capa_url as string | null) ?? null,
    ativo: Boolean(m.ativo),
  }));

  return <MateriaisClient materiais={materiais} />;
}

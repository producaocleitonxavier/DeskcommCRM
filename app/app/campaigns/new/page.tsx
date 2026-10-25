import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { NovaCampanha } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nova campanha" };

export default async function NovaCampanhaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  // Materiais ativos da biblioteca (pol_materiais) para a entrega automática na
  // resposta. RLS por org via o client de sessão.
  const db = await createClient();
  const { data } = await db
    .from("pol_materiais")
    .select("id, titulo, tipo")
    .eq("organization_id", org.orgId)
    .eq("ativo", true)
    .order("titulo", { ascending: true });
  const materiais = (data ?? []) as { id: string; titulo: string; tipo: string }[];

  return <NovaCampanha materiais={materiais} />;
}

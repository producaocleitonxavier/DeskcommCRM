/**
 * /app/politico/locais/novo — cadastrar local (e, opcional, o evento nele).
 * Server component: auth + materiais da Biblioteca (para escolher o ebook do evento).
 * O form (client) grava via server action. Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovoLocalForm, { type MaterialOpcao } from "./form";

export const dynamic = "force-dynamic";

export default async function NovoLocalPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data } = await db
    .from("pol_materiais")
    .select("id, titulo")
    .eq("organization_id", org.orgId)
    .eq("ativo", true)
    .order("titulo");
  const materiais: MaterialOpcao[] = ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    titulo: String(m.titulo ?? ""),
  }));

  return <NovoLocalForm materiais={materiais} />;
}

/**
 * /app/politico/locais/novo — cadastrar local (e, opcional, o evento nele).
 * Server component: auth + materiais da Biblioteca (para escolher o ebook do evento).
 * O form (client) grava via server action. Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovoLocalForm, { type MaterialOpcao, type LiderancaOpcao } from "./form";

export const dynamic = "force-dynamic";

export default async function NovoLocalPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [{ data }, { data: lids }] = await Promise.all([
    db.from("pol_materiais").select("id, titulo").eq("organization_id", org.orgId).eq("ativo", true).order("titulo"),
    db.from("pol_liderancas").select("id, nome, apelido").eq("organization_id", org.orgId).order("nome"),
  ]);
  const materiais: MaterialOpcao[] = ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    titulo: String(m.titulo ?? ""),
  }));
  const liderancas: LiderancaOpcao[] = ((lids ?? []) as Record<string, unknown>[]).map((l) => ({
    id: String(l.id),
    nome: (String(l.apelido ?? "").trim() || String(l.nome ?? "").trim()) || "Liderança",
  }));

  return <NovoLocalForm materiais={materiais} liderancas={liderancas} />;
}

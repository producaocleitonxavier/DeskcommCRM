/**
 * /app/politico/leads/novo — Novo cadastro (War Room 2.0)
 *
 * Formulário para cadastrar uma nova pessoa na base política.
 * Cria o contact + pol_lead em sequência via API.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import NovoCadastroForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovoCadastroPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  // Buscar territórios da organização para o select
  const db = await createClient();
  const { data: territorios } = await db
    .from("pol_territories")
    .select("id, name, type")
    .eq("organization_id", org.orgId)
    .order("name");

  return (
    <div className="mx-auto max-w-[720px] px-4 py-7 space-y-[18px]">
      {/* Header */}
      <header className="wr-card p-6 sm:p-7">
        <h1 className="font-heading text-[28px] sm:text-[36px] font-bold leading-tight">
          Novo cadastro
        </h1>
        <p className="mt-1.5 text-base" style={{ color: "var(--color-text-muted)" }}>
          Preencha os dados para adicionar uma nova pessoa à base.
        </p>
      </header>

      {/* Formulário */}
      <NovoCadastroForm territorios={territorios ?? []} />
    </div>
  );
}

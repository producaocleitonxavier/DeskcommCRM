/**
 * /app/politico/configuracao — Setup do Mandato (assistente de pré-config).
 * Esqueleto visual (Passo 2 da generalização multi-mandato). Admin apenas.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import SetupWizard from "./_wizard-client";

export const dynamic = "force-dynamic";

export default async function ConfiguracaoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.admin) redirect("/app/politico");

  const db = await createClient();
  const { data } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, cidade, subtitulo")
    .eq("organization_id", org.orgId)
    .maybeSingle();

  return (
    <SetupWizard
      inicial={{
        nome: data?.nome_parlamentar ?? "",
        cargo: data?.cargo ?? "",
        cidade: data?.cidade ?? "",
        subtitulo: data?.subtitulo ?? "",
      }}
    />
  );
}

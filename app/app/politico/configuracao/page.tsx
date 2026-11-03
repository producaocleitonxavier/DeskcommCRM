/**
 * /app/politico/configuracao — Setup do Mandato (assistente de pré-config).
 * Esqueleto visual (Passo 2 da generalização multi-mandato). Admin apenas.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { lerMandatoConfig } from "@/lib/politico/setup-do-mandato";
import SetupWizard from "./_wizard-client";

export const dynamic = "force-dynamic";

export default async function ConfiguracaoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.admin) redirect("/app/politico");

  const db = await createClient();
  // Identidade (pol_gabinete_config) + mandato (settings.gabinete.mandato): o
  // assistente é um EDITOR, então pré-carrega TUDO — reeditar o tipo não apaga o
  // resto (canais/portal/órgãos/bio/temas).
  const [cfgRes, orgRes] = await Promise.all([
    db.from("pol_gabinete_config").select("nome_parlamentar, cargo, cidade, subtitulo").eq("organization_id", org.orgId).maybeSingle(),
    db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle(),
  ]);
  const data = cfgRes.data;
  const m = lerMandatoConfig(orgRes.data?.settings);

  return (
    <SetupWizard
      inicial={{
        nome: data?.nome_parlamentar ?? "",
        cargo: data?.cargo ?? "",
        cidade: data?.cidade ?? "",
        subtitulo: data?.subtitulo ?? "",
        tipo: m?.tipo ?? null,
        uf: m?.uf ?? null,
        whats: m?.whats ?? null,
        horario: m?.horario ?? null,
        insta: m?.insta ?? null,
        endereco: m?.endereco ?? null,
        email: m?.email ?? null,
        agendaContato: m?.agendaContato ?? null,
        portal: m?.portal ?? null,
        servicos: m?.servicos ?? null,
        orgaos: m?.orgaos ?? null,
        bio: m?.bio ?? null,
        temas: m?.temas ?? null,
      }}
    />
  );
}

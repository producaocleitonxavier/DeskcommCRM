import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { CommandHero } from "@/components/politico/command-hero";
import { WebhooksClient } from "./_components/WebhooksClient";
import { ModoGabinete } from "./_components/gabinete";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Formulários do site" };

export default async function WebhooksPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const canManage = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!canManage) redirect("/app/inbox");

  // Gabinete parlamentar? Então a tela fala de cadastro e pessoa, não de lead e funil.
  const db = await createClient();
  const { data: gab } = await db.from("pol_gabinete_config").select("organization_id").eq("organization_id", activeOrg!.orgId).maybeSingle();
  const gabinete = !!gab;

  return (
    <ModoGabinete gabinete={gabinete}>
    <div className="flex h-full flex-col gap-6 p-6">
      <CommandHero
        eyebrow="Configurações · Avançado"
        titulo="Formulários do site"
        subtitulo="Receba no sistema os cadastros feitos num site ou formulário de fora, e escolha o que acontece com cada um."
      />
      <WebhooksClient />
    </div>
    </ModoGabinete>
  );
}

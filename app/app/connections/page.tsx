import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ConexoesShell } from "@/components/connections/ConexoesShell";
import { canalGraphParceiroLigado, GRAPH_PARTNER_LABEL } from "@/lib/channels/graph-parceiro/credentials";
import { CommandHero } from "@/components/politico/command-hero";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conexões" };

export default async function ConnectionsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const key = process.env.WAHA_API_KEY;
  const wahaConfigured = Boolean(
    process.env.WAHA_API_BASE_URL && key && key !== "dev_plaintext_change_me",
  );
  const wacallsConfigured = Boolean(process.env.WACALLS_API_BASE_URL);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CommandHero
        eyebrow="Canais · Conexões"
        titulo="Conexões"
        subtitulo="Por onde você fala com o seu público. Conecte números por QR ou o número oficial da Meta, e acompanhe a saúde de cada um."
      />
      <ConexoesShell
        wahaConfigured={wahaConfigured}
        wacallsConfigured={wacallsConfigured}
        graphParceiro={canalGraphParceiroLigado() ? { label: GRAPH_PARTNER_LABEL } : null}
      />
    </div>
  );
}

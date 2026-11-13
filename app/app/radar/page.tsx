import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import { RiskRadarList } from "./_components/RiskRadarList";
import { exigirPortaDoPerfil } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demandas paradas" };

export default async function RadarPage() {
  await exigirPortaDoPerfil("/app/radar");
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CommandHero
        eyebrow="Conversas · Demandas paradas"
        titulo="Demandas paradas"
        subtitulo="Demandas abertas em que ninguém combinou o próximo passo. Cada uma é um cidadão esperando resposta. Toque numa linha para abrir e resolver."
      />
      <RiskRadarList />
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import { RiskRadarList } from "./_components/RiskRadarList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Radar" };

export default async function RadarPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CommandHero
        eyebrow="Atendimento · Radar"
        titulo="Radar de risco"
        subtitulo="Demandas abertas que pararam e precisam de você. Cada uma é um cidadão esperando resposta. Se o assistente já marcou um retorno, ela aparece como “com retorno marcado”."
      />
      <RiskRadarList />
    </div>
  );
}

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
        subtitulo="Demandas abertas que esfriaram e precisam de você. Se o assistente já agendou um retorno, aparece como “em voo”; sem próximo passo, é risco de perder o cliente."
      />
      <RiskRadarList />
    </div>
  );
}

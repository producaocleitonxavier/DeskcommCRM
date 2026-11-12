import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { listarOrigensEGrupos, conversaoDasOrigens } from "@/lib/politico/origens-grupos";
import GruposOrigemClient from "./_client";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Grupos de origem" };

export default async function GruposOrigemPage() {
  await exigirAcessoPolitico("grupos-origem");
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [{ grupos, aClassificar, outrasPoucas }, conversao] = await Promise.all([
    listarOrigensEGrupos(db, org.orgId),
    conversaoDasOrigens(db, org.orgId),
  ]);

  return (
    <GruposOrigemClient
      grupos={grupos}
      aClassificar={aClassificar}
      outrasPoucas={outrasPoucas}
      conversao={conversao}
    />
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { listarOrigensEGrupos } from "@/lib/politico/origens-grupos";
import GruposOrigemClient from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Grupos de origem" };

export default async function GruposOrigemPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { grupos, aClassificar, outrasPoucas } = await listarOrigensEGrupos(db, org.orgId);

  return <GruposOrigemClient grupos={grupos} aClassificar={aClassificar} outrasPoucas={outrasPoucas} />;
}

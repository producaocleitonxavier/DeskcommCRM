/**
 * /app/politico/multiplicadores — MULTIPLICADORES (placar de divulgação)
 *
 * Server component: auth + carga. Marque assessores/lideranças e acompanhe quem
 * divulga (link pessoal de vídeo = alcance; código de indicação = cadastros
 * trazidos). Inclui os ZEROS: ver quem AINDA NÃO divulgou é o ponto. Visual em ./_client.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { listarMultiplicadores, sugestoesDeMultiplicador } from "@/lib/politico/multiplicadores";
import MultiplicadoresClient from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Multiplicadores" };

export default async function MultiplicadoresPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const multiplicadores = await listarMultiplicadores(db, org.orgId);
  const jaNoCohort = new Set(multiplicadores.map((m) => m.contactId));
  const sugestoes = await sugestoesDeMultiplicador(db, org.orgId, jaNoCohort);

  return <MultiplicadoresClient multiplicadores={multiplicadores} sugestoes={sugestoes} />;
}

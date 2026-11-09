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
import { contarElegiveisParaConvite, contarPotenciaisParaConvite } from "@/lib/politico/divulgador";
import {
  listarVideosDaBiblioteca,
  listarEnquetesParaEnviar,
} from "@/app/actions/politico/multiplicadores-envio-actions";
import {
  canalMultiplicadoresAtual,
  listarCanaisDisponiveis,
} from "@/app/actions/politico/multiplicadores-canal-actions";
import MultiplicadoresClient from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Multiplicadores" };

export default async function MultiplicadoresPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const multiplicadoresBase = await listarMultiplicadores(db, org.orgId);
  // Resolve o lead de cada multiplicador → nome vira link pra ficha, onde se vê
  // "Cadastros que trouxe" (fecha o loop: do placar à lista de quem ele trouxe).
  const idsMult = multiplicadoresBase.map((m) => m.contactId);
  let leadPorContato = new Map<string, string>();
  if (idsMult.length) {
    const { data: leadsRel } = await db
      .from("pol_leads")
      .select("id, contact_id")
      .eq("organization_id", org.orgId)
      .in("contact_id", idsMult);
    leadPorContato = new Map(((leadsRel ?? []) as { id: string; contact_id: string }[]).map((l) => [l.contact_id, l.id]));
  }
  const multiplicadores = multiplicadoresBase.map((m) => ({ ...m, leadId: leadPorContato.get(m.contactId) ?? null }));
  const jaNoCohort = new Set(multiplicadores.map((m) => m.contactId));
  const [sugestoes, videos, enquetes, elegiveis, potenciais, canais, canalAtual] = await Promise.all([
    sugestoesDeMultiplicador(db, org.orgId, jaNoCohort),
    listarVideosDaBiblioteca(),
    listarEnquetesParaEnviar(),
    contarElegiveisParaConvite(db, org.orgId),
    contarPotenciaisParaConvite(db, org.orgId),
    listarCanaisDisponiveis(),
    canalMultiplicadoresAtual(),
  ]);

  return (
    <MultiplicadoresClient
      multiplicadores={multiplicadores}
      sugestoes={sugestoes}
      videos={videos}
      enquetes={enquetes}
      elegiveis={elegiveis}
      potenciais={potenciais}
      canais={canais}
      canalAtual={canalAtual}
    />
  );
}

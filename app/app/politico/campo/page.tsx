/**
 * /app/politico/campo — Captura de campo ("10 segundos")
 *
 * A tela que dá ATITUDE ao assessor: viu um fio pendurado / poste caindo /
 * buraco → fala ou escreve + foto + GPS → a IA limpa e estrutura, sugere o
 * órgão a cobrar → revisa e registra. Vira demanda do gabinete atribuída a ele.
 *
 * Server component só resolve auth + o tipo de mandato (para os chips de órgão).
 * Todo o fluxo (gravar voz, GPS, IA, confirmar) vive no client. Acesso: agent+.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { lerMandatoConfig } from "@/lib/politico/setup-do-mandato";
import { orgaosSugeridos } from "@/lib/politico/demanda-cobranca";
import { vozDisponivel } from "@/app/actions/politico/captura-campo";
import CapturaCampoClient from "./_captura-client";

export const dynamic = "force-dynamic";

export default async function CapturaCampoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data: orgRow } = await db
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  const tipoMandato = lerMandatoConfig((orgRow as { settings?: unknown } | null)?.settings)?.tipo ?? null;
  const orgaosChips = orgaosSugeridos(tipoMandato);
  // A voz só aparece se a transcrição estiver de fato disponível nesta instalação/org.
  const voz = await vozDisponivel();

  return <CapturaCampoClient orgaosChips={orgaosChips} vozDisponivel={voz} />;
}

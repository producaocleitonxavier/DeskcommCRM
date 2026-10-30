/**
 * /app/politico/narrativas — Narrativas Territoriais por IA (Pilar 3).
 *
 * Server: auth + mandato TSE + lista de municípios + histórico de narrativas.
 * A geração (IA cross-data) acontece no client via server actions.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { obterMandatoTse } from "@/app/actions/politico/obras-actions";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";
import { listarNarrativas } from "@/app/actions/politico/narrativa";
import NarrativasClient from "./_narrativas-client";

export const dynamic = "force-dynamic";

export default async function NarrativasPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const mandato = await obterMandatoTse();
  const [municipios, historico] = await Promise.all([
    mandato ? listarMunicipiosRaioX("MG") : Promise.resolve([]),
    listarNarrativas(20),
  ]);

  return (
    <NarrativasClient
      temMandato={!!mandato}
      mandatoNome={mandato?.nome ?? null}
      electionId={mandato?.electionId ?? 0}
      municipios={municipios}
      historico={historico}
    />
  );
}

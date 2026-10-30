/**
 * /app/politico/boletim — Boletim Semanal de Inteligência.
 * Server: auth manager+, lê a identidade do mandato p/ o escopo adaptativo
 * (municipal/estadual/nacional) e passa ao cliente, que gera o boletim sob demanda.
 */
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { lerIdentidadeDoMandato, escopoDaInteligencia } from "@/lib/politico/identidade-do-mandato";
import BoletimClient from "./_boletim-client";

export const dynamic = "force-dynamic";

export default async function BoletimPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const db = await createClient();
  const identidade = await lerIdentidadeDoMandato(db, org.orgId);
  const escopo = escopoDaInteligencia(identidade, null);

  return (
    <BoletimClient
      mandatoNome={identidade.nomeParlamentar}
      cargo={identidade.cargo}
      escopoRotulo={escopo.rotulo}
      lugar={escopo.lugar}
      abrangencia={escopo.abrangencia}
    />
  );
}

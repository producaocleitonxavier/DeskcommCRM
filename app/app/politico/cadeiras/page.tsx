/**
 * /app/politico/cadeiras — Projeção de Cadeiras (Quociente Eleitoral/Partidário).
 *
 * Simulador para eleições proporcionais (vereador, dep. estadual/federal):
 * projeta QE/QP/sobras sobre os votos nominais do último pleito. Server: auth +
 * eleições proporcionais + municípios. O cálculo e o simulador vivem no client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { listarEleicoes } from "@/app/actions/politico/intelEleitoral";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";
import CadeirasClient from "./_cadeiras-client";

export const dynamic = "force-dynamic";

const PROPORCIONAIS = new Set([6, 7, 13]); // dep. federal, dep. estadual, vereador

export default async function CadeirasPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const [eleicoes, municipios] = await Promise.all([listarEleicoes(), listarMunicipiosRaioX("MG")]);
  const proporcionais = eleicoes
    .filter((e) => PROPORCIONAIS.has(e.cargo_cod) && e.turno === 1)
    .map((e) => ({ id: e.id, label: `${e.ano} · ${e.cargo}`, cargoCod: e.cargo_cod, ano: e.ano }));

  return <CadeirasClient eleicoes={proporcionais} municipios={municipios} />;
}

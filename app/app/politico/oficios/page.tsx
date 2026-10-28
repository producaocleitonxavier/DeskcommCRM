/**
 * /app/politico/oficios — busca de ofícios do gabinete (achar 1 entre centenas).
 * Server component: auth + carga inicial (sem termo). A busca interativa vive no
 * ./_client via server action. Acesso: manager+ (mesma régua do Gabinete).
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { buscarOficios } from "@/app/actions/politico/oficios";
import OficiosClient from "./_client";

export const dynamic = "force-dynamic";

export default async function OficiosPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const { itens, temMais } = await buscarOficios("", 0);
  return <OficiosClient inicial={itens} temMaisInicial={temMais} />;
}

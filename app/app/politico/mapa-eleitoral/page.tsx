/**
 * /app/politico/mapa-eleitoral — APOSENTADA e fundida no Radar Zonal.
 *
 * O "Mapa de Votos" (choropleth) foi removido; "Minha Força" e "Projeção"
 * viraram visões do Radar Zonal, que passou a ser o hub do Território. Mantemos
 * a rota só para não quebrar links antigos: redireciona para o Radar.
 *
 * Os client components _projecao-client.tsx e _territorio-client.tsx continuam
 * NESTA pasta (importados pelo Radar Zonal).
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MapaEleitoralRedirect() {
  redirect("/app/politico/radar-zonal");
}

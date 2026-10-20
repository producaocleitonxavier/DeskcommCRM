/**
 * /app/politico/projecao — APOSENTADA e fundida no Território.
 *
 * A projeção antiga rodava sobre pol_tse_data (tabela TSE legada, vazia nesta
 * instalação) e não usava o dado vivo. A projeção nova (universo de votos ×
 * base do CRM por zona) vive como camada do Território. Mantemos a rota só para
 * não quebrar links antigos: redireciona para a camada Projeção.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ProjecaoRedirect() {
  redirect("/app/politico/mapa-eleitoral?camada=projecao");
}

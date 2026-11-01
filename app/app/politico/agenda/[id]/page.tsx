/**
 * /app/politico/agenda/[id] — APOSENTADA. O detalhe/edição de compromisso vive
 * agora na Agenda completa do Gabinete (`/app/agenda`). Redireciona para não
 * quebrar links antigos (o id é ignorado — a lista completa abre em /app/agenda).
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CompromissoDetalheRedirect(): never {
  redirect("/app/agenda");
}

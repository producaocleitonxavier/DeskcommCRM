/**
 * /app/politico/agenda/novo — APOSENTADA. Criar compromisso agora é na Agenda
 * completa do Gabinete (`/app/agenda`). Redireciona para não quebrar links.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function NovoCompromissoRedirect(): never {
  redirect("/app/agenda");
}

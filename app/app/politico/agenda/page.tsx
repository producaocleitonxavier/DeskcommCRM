/**
 * /app/politico/agenda — APOSENTADA. A Agenda do mandato foi fundida na Agenda
 * completa do Gabinete (`/app/agenda`), que marca, vincula o cidadão, sincroniza
 * com o Google e manda lembretes. Este caminho só redireciona, para não quebrar
 * links/bookmarks antigos.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AgendaDoMandatoRedirect(): never {
  redirect("/app/agenda");
}

/**
 * /app/politico/pesquisas/[id]/disparar — preparar o disparo da pesquisa (Fase 2).
 * Server: auth manager+, carrega a pesquisa + nº de perguntas + nome do mandato.
 */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { lerIdentidadeDoMandato } from "@/lib/politico/identidade-do-mandato";
import DispararClient from "./_disparar-client";

export const dynamic = "force-dynamic";

export default async function DispararPesquisaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const { id } = await params;
  const db = await createClient();
  const { data: survey } = await db
    .from("pol_surveys")
    .select("id, title")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!survey) notFound();
  const s = survey as { id: string; title: string };

  const { count } = await db
    .from("pol_survey_questions")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", id)
    .eq("organization_id", org.orgId);
  const identidade = await lerIdentidadeDoMandato(db, org.orgId);

  return (
    <DispararClient
      surveyId={s.id}
      titulo={s.title}
      numPerguntas={count ?? 0}
      nomeMandato={identidade.nomeParlamentar}
    />
  );
}

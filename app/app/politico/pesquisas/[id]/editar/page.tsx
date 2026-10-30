/**
 * /app/politico/pesquisas/[id]/editar — construtor de perguntas (Fase 1).
 * Server: auth manager+, carrega a pesquisa + perguntas + nome do mandato (para
 * o preview e as sugestões, sem nome chumbado).
 */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { lerIdentidadeDoMandato } from "@/lib/politico/identidade-do-mandato";
import { lerPerguntas } from "@/app/actions/politico/pesquisa-actions";
import EditorClient from "./_editor-client";

export const dynamic = "force-dynamic";

export default async function EditarPesquisaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const { id } = await params;
  const db = await createClient();
  const { data: survey } = await db
    .from("pol_surveys")
    .select("id, title, description, theme")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!survey) notFound();

  const [perguntas, identidade] = await Promise.all([
    lerPerguntas(id),
    lerIdentidadeDoMandato(db, org.orgId),
  ]);
  const s = survey as { id: string; title: string; description: string | null; theme: string | null };

  return (
    <EditorClient
      surveyId={s.id}
      titulo={s.title}
      descricao={s.description ?? ""}
      temaPesquisa={s.theme ?? "geral"}
      perguntasIniciais={perguntas}
      nomeMandato={identidade.nomeParlamentar}
    />
  );
}

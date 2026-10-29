/**
 * /app/politico/prestacao-contas — Painel do Mandato (Fase B #4).
 *
 * A LENTE DO TRABALHO DO MANDATO (prestação de contas), complementar ao Painel
 * de campanha (/dashboard). Dados em `lib/politico/prestacao-contas-dados.ts`
 * (mesma fonte do relatório em PDF). Acesso: manager+.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { buscarPrestacaoContas, normalizarPeriodo } from "@/lib/politico/prestacao-contas-dados";
import PageTabs from "@/components/politico/page-tabs";
import PrestacaoContasClient from "./_client";

const COMANDO_TABS = [
  { id: "hoje", label: "Hoje", href: "/app/politico" },
  { id: "painel", label: "Painel", href: "/app/politico/dashboard" },
  { id: "prestacao", label: "Prestação de Contas", href: "/app/politico/prestacao-contas" },
];

export const dynamic = "force-dynamic";

export default async function PrestacaoContasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const params = await searchParams;
  const periodo = normalizarPeriodo(typeof params.periodo === "string" ? params.periodo : undefined);
  const dados = await buscarPrestacaoContas(org.orgId, periodo);
  const ehAdmin = ROLE_RANK[org.role] >= ROLE_RANK.admin;

  return (
    <>
      <PageTabs abas={COMANDO_TABS} active="prestacao" maxW="1140px" />
      <PrestacaoContasClient dados={dados} ehAdmin={ehAdmin} />
    </>
  );
}

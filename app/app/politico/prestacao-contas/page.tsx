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
import { buscarOndeInvestir } from "@/lib/politico/onde-investir";
import PrestacaoContasClient from "./_client";


export const dynamic = "force-dynamic";

export default async function PrestacaoContasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  // Prestação de Contas é gestão = gerente+. Assessor (agent) cai no Hoje.
  // Trava REAL de papel (não só a aba escondida).
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) redirect("/app/politico");

  const params = await searchParams;
  const periodo = normalizarPeriodo(typeof params.periodo === "string" ? params.periodo : undefined);
  const [dados, ondeInvestir] = await Promise.all([
    buscarPrestacaoContas(org.orgId, periodo),
    buscarOndeInvestir(org.orgId),
  ]);
  const ehAdmin = ROLE_RANK[org.role] >= ROLE_RANK.admin;

  return (
    <>
      <PrestacaoContasClient dados={dados} ondeInvestir={ondeInvestir} ehAdmin={ehAdmin} />
    </>
  );
}

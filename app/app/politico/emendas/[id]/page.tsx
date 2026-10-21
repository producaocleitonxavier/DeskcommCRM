/**
 * /app/politico/emendas/[id] — detalhe, edição e pipeline de execução de uma
 * emenda (Gabinete). Server: auth + busca da emenda + territórios/lideranças.
 *
 * Acesso: manager+
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { obterMandatoTse, pesoBairro, type PesoBairro } from "@/app/actions/politico/obras-actions";
import DetalheEmendaClient, { type EmendaDetalhe } from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function EmendaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [emRes, terrRes, lidRes] = await Promise.all([
    db
      .from("pol_emendas")
      .select(
        "id, numero, ano, tipo, esfera, valor_indicado_cents, valor_empenhado_cents, valor_liquidado_cents, valor_pago_cents, municipio, bairro, entidade_beneficiada, cnpj_entidade, territory_id, responsavel_nome, area_tematica, descricao, objeto, status, data_indicacao, data_empenho, data_liquidacao, data_pagamento, prazo_execucao, beneficiarios_estimados, lideranca_id, observacoes, publica",
      )
      .eq("organization_id", org.orgId)
      .eq("id", id)
      .maybeSingle(),
    db.from("pol_territories").select("id, name, state_code").eq("organization_id", org.orgId).order("name").limit(600),
    db.from("pol_liderancas").select("id, nome, cidade").eq("organization_id", org.orgId).eq("status", "ativo").order("nome").limit(500),
  ]);

  if (!emRes.data) notFound();

  const territorios = ((terrRes.data ?? []) as { id: string; name: string; state_code: string | null }[]).map((t) => ({
    id: t.id,
    nome: t.state_code ? `${t.name} · ${t.state_code}` : t.name,
  }));
  const liderancas = ((lidRes.data ?? []) as { id: string; nome: string; cidade: string | null }[]).map((l) => ({
    id: l.id,
    nome: l.cidade ? `${l.nome} · ${l.cidade}` : l.nome,
  }));

  // Peso eleitoral do bairro da emenda (você investiu onde te elegeu?), via mandato TSE.
  const em = emRes.data as { municipio?: string | null; bairro?: string | null };
  const mandato = await obterMandatoTse();
  let peso: PesoBairro | null = null;
  if (mandato && em.municipio && em.bairro) {
    const { data: mun } = await db.from("intel_municipios").select("tse_code").ilike("nome", em.municipio).limit(1).maybeSingle();
    const tse = (mun as { tse_code?: string } | null)?.tse_code;
    if (tse) peso = await pesoBairro(mandato.electionId, mandato.sq, tse, em.bairro);
  }

  const { count: beneficiarios } = await db
    .from("pol_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.orgId)
    .eq("pol_emenda_id", id);

  return <DetalheEmendaClient emenda={emRes.data as unknown as EmendaDetalhe} territorios={territorios} liderancas={liderancas} peso={peso} mandatoNome={mandato?.nome ?? null} beneficiarios={beneficiarios ?? 0} />;
}

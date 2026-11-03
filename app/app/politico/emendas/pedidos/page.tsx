/**
 * /app/politico/emendas/pedidos — CAIXA DE ENTRADA DE PEDIDOS DE EMENDA.
 *
 * A etapa 1 do ciclo: quem pede o quê (prefeito, entidade, liderança), ANTES de
 * o parlamentar decidir. Lista os status='solicitada' da org; o gabinete atende
 * (vira indicada) ou recusa. Acesso manager+.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { rotuloArea } from "@/lib/politico/emenda-classificar";
import PedidosClient, { type PedidoItem } from "./_pedidos-client";

export const dynamic = "force-dynamic";

function moeda(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function PedidosEmendaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) redirect("/app/politico/emendas");

  const db = await createClient();
  const { data } = await db
    .from("pol_emendas")
    .select("id, ano, objeto, descricao, area_tematica, valor_indicado_cents, municipio, bairro, solicitante_nome, solicitante_origem, data_solicitacao")
    .eq("organization_id", org.orgId)
    .eq("status", "solicitada")
    .order("data_solicitacao", { ascending: true })
    .limit(500);

  const rows = (data ?? []) as Record<string, unknown>[];
  const pedidos: PedidoItem[] = rows.map((e) => {
    return {
      id: String(e.id),
      solicitante: (e.solicitante_nome as string | null) ?? "—",
      origem: (e.solicitante_origem as string | null)?.trim() || null,
      objeto: (e.objeto as string | null) ?? (e.descricao as string | null) ?? "—",
      descricao: (e.descricao as string | null) ?? null,
      area: rotuloArea(String(e.area_tematica ?? "outro")),
      valor: moeda(Number(e.valor_indicado_cents ?? 0)),
      local: [(e.bairro as string | null) ?? "", (e.municipio as string | null) ?? ""].map((s) => s.trim()).filter(Boolean).join(" · ") || null,
      data: (e.data_solicitacao as string | null) ?? null,
    };
  });

  return <PedidosClient pedidos={pedidos} />;
}

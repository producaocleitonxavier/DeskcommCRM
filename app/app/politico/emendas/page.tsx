/**
 * /app/politico/emendas — Emendas Parlamentares (War Room 2.0)
 *
 * Server: auth + fetch (pol_emendas). Visual em ./_emendas-client.
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import EmendasClient, { type EmendaItem } from "./_emendas-client";

export const dynamic = "force-dynamic";

const AREA_LABELS: Record<string, string> = {
  saude: "Saúde",
  educacao: "Educação",
  seguranca: "Segurança",
  assistencia_social: "Assist. Social",
  infraestrutura: "Infraestrutura",
  cultura: "Cultura",
  esporte: "Esporte",
  meio_ambiente: "Meio Ambiente",
  agricultura: "Agricultura",
  tecnologia: "Tecnologia",
  outro: "Outro",
};

const AREA_COR = ["#4352C4", "#6B79DD", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#0EA5E9", "#14B8A6", "#EC4899", "#9CA3AF"];

function moeda(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function EmendasPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const { data } = await db
    .from("pol_emendas")
    .select(
      "id, numero, ano, tipo, esfera, valor_indicado_cents, valor_empenhado_cents, valor_pago_cents, municipio, entidade_beneficiada, area_tematica, status",
    )
    .eq("organization_id", org.orgId)
    .order("ano", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as Record<string, unknown>[];

  const totalIndicado = rows.reduce((s, e) => s + Number(e.valor_indicado_cents ?? 0), 0);
  const totalPago = rows.reduce((s, e) => s + Number(e.valor_pago_cents ?? 0), 0);

  // Valor indicado por área (em reais) para o BarChart.
  const porArea = new Map<string, number>();
  for (const e of rows) {
    const area = String(e.area_tematica ?? "outro");
    porArea.set(area, (porArea.get(area) ?? 0) + Number(e.valor_indicado_cents ?? 0));
  }
  const valorPorArea = [...porArea.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([area, cents], i) => ({
      name: AREA_LABELS[area] ?? area,
      value: Math.round(cents / 100),
      fill: AREA_COR[i % AREA_COR.length]!,
    }));

  const emendas: EmendaItem[] = rows.map((e) => ({
    id: String(e.id),
    numero: (e.numero as string | null) ?? null,
    ano: Number(e.ano ?? 0),
    area: AREA_LABELS[String(e.area_tematica)] ?? String(e.area_tematica ?? "Outro"),
    status: String(e.status ?? "rascunho"),
    municipio: (e.municipio as string | null) ?? null,
    entidade: (e.entidade_beneficiada as string | null) ?? null,
    valorIndicado: moeda(Number(e.valor_indicado_cents ?? 0)),
    valorPago: moeda(Number(e.valor_pago_cents ?? 0)),
  }));

  return (
    <EmendasClient
      kpis={{
        alocado: moeda(totalIndicado),
        executado: moeda(totalPago),
        pendente: moeda(Math.max(0, totalIndicado - totalPago)),
      }}
      valorPorArea={valorPorArea}
      emendas={emendas}
      ehAdmin={ROLE_RANK[org.role] >= ROLE_RANK.admin}
    />
  );
}

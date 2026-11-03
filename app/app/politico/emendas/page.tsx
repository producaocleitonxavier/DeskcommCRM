/**
 * /app/politico/emendas — Painel de Emendas Parlamentares (War Room 2.0).
 *
 * Server: auth + fetch (pol_emendas) + leitura do TIPO DE MANDATO (vereador vê
 * por bairro; deputado, por município/meso-região) + cruzamento emenda×voto
 * (TSE, fail-soft). A derivação dos números é pura (lib/politico/emenda-painel).
 * Visual em ./_emendas-client. Acesso: manager+.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { lerMandatoConfig } from "@/lib/politico/setup-do-mandato";
import { derivarPainel, AREA_LABELS, type EmendaLite, type TipoMandato } from "@/lib/politico/emenda-painel";
import { buscarEmendaVotos } from "@/app/actions/politico/emenda-votos-actions";
import EmendasClient, { type EmendaItem } from "./_emendas-client";

export const dynamic = "force-dynamic";

const AREA_COR = ["#4352C4", "#6B79DD", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#0EA5E9", "#14B8A6", "#EC4899", "#9CA3AF", "#64748B"];
const TIPOS_VALIDOS: TipoMandato[] = ["vereador", "prefeito", "dep_estadual", "dep_federal"];

function moeda(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function emReais(cents: number): number {
  return Math.round(cents / 100);
}

export default async function EmendasPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  // Tipo de mandato (fail-soft → vereador).
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  const tipoBruto = lerMandatoConfig((orgRow as { settings?: unknown } | null)?.settings)?.tipo ?? "";
  const tipo: TipoMandato = TIPOS_VALIDOS.includes(tipoBruto as TipoMandato) ? (tipoBruto as TipoMandato) : "vereador";
  const ehDeputado = tipo === "dep_estadual" || tipo === "dep_federal";

  const { data } = await db
    .from("pol_emendas")
    .select(
      "id, numero, ano, tipo, esfera, modalidade, meso_regiao, valor_indicado_cents, valor_empenhado_cents, valor_pago_cents, municipio, bairro, entidade_beneficiada, area_tematica, status, beneficiarios_estimados",
    )
    .eq("organization_id", org.orgId)
    .order("ano", { ascending: false })
    .limit(2000);

  const rows = (data ?? []) as Record<string, unknown>[];

  // Lite (puro) para derivar o painel.
  const lite: EmendaLite[] = rows.map((e) => ({
    id: String(e.id),
    ano: Number(e.ano ?? 0),
    status: String(e.status ?? "indicada"),
    area: String(e.area_tematica ?? "outro"),
    municipio: (e.municipio as string | null) ?? null,
    bairro: (e.bairro as string | null) ?? null,
    mesoRegiao: (e.meso_regiao as string | null) ?? null,
    modalidade: (e.modalidade as string | null) ?? null,
    valorIndicadoCents: Number(e.valor_indicado_cents ?? 0),
    valorPagoCents: Number(e.valor_pago_cents ?? 0),
  }));

  const painel = derivarPainel(lite, tipo);

  // Diferencial: votos cruzados (TSE). Bônus — nunca derruba a página.
  const votos = await buscarEmendaVotos(org.orgId, tipo);

  // Gráficos (reais + cor + rótulo visível).
  const porArea = painel.porArea.map((a, i) => ({ name: AREA_LABELS[a.nome] ?? a.nome, value: emReais(a.valorCents), fill: AREA_COR[i % AREA_COR.length]! }));
  const porAno = painel.porAno.map((a) => ({ name: String(a.ano), value: emReais(a.valorCents), fill: "#4352C4" }));
  const porRegiao = painel.porRegiao.map((r, i) => ({ name: r.nome, value: emReais(r.valorCents), fill: AREA_COR[i % AREA_COR.length]! }));

  // Lista da tabela (explorável).
  const emendas: EmendaItem[] = rows.map((e) => ({
    id: String(e.id),
    numero: (e.numero as string | null) ?? null,
    ano: Number(e.ano ?? 0),
    area: AREA_LABELS[String(e.area_tematica)] ?? String(e.area_tematica ?? "Outro"),
    areaKey: String(e.area_tematica ?? "outro"),
    status: String(e.status ?? "indicada"),
    municipio: (e.municipio as string | null) ?? null,
    bairro: (e.bairro as string | null) ?? null,
    entidade: (e.entidade_beneficiada as string | null) ?? null,
    modalidade: (e.modalidade as string | null) ?? null,
    valorIndicado: moeda(Number(e.valor_indicado_cents ?? 0)),
    valorPago: moeda(Number(e.valor_pago_cents ?? 0)),
  }));

  return (
    <EmendasClient
      tipo={tipo}
      ehDeputado={ehDeputado}
      kpis={{
        destinosAtendidos: painel.kpis.destinosAtendidos,
        totalIndicacoes: painel.kpis.totalIndicacoes,
        valorTotalIndicado: moeda(painel.kpis.valorTotalIndicadoCents),
      }}
      financeiro={{
        alocado: moeda(painel.financeiro.alocadoCents),
        executado: moeda(painel.financeiro.executadoCents),
        pendente: moeda(painel.financeiro.pendenteCents),
      }}
      pedidosAguardando={painel.pedidosAguardando}
      porArea={porArea}
      porAno={porAno}
      porRegiao={porRegiao}
      emendas={emendas}
      votos={{
        temDados: votos.temDados,
        resumo: {
          oportunidade: moeda(votos.resumo.valorOportunidadeCents),
          fortaleza: moeda(votos.resumo.valorFortalezaCents),
          nOportunidade: votos.resumo.nOportunidade,
          nFortaleza: votos.resumo.nFortaleza,
        },
        itens: votos.itens.slice(0, 12).map((c) => ({
          rotulo: c.rotulo,
          valor: moeda(c.valorIndicadoCents),
          votos: c.votos,
          pct: c.pctVotos,
          leitura: c.leitura,
        })),
      }}
      ehAdmin={ROLE_RANK[org.role] >= ROLE_RANK.admin}
    />
  );
}

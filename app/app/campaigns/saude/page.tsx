/**
 * /app/campaigns/saude — Saúde dos Números (entregabilidade visível dos Disparos)
 *
 * Os OLHOS do disparo: por número conectado, mostra o veredito do FREIO DE SAÚDE
 * (o circuito de `lib/agent-engine/health/circuit.ts`) em linguagem de cliente —
 * saudável, em espera (queimando), ou número novo aguardando liberação — mais
 * quanto cada número já enviou hoje. Vive DENTRO de Disparos (alcançada pelo botão
 * no topo da lista): é onde se olha a saúde ANTES de disparar. É a peça que precisa
 * existir ANTES de o freio agir na campanha — o operador tem de poder VER o número
 * esquentar.
 *
 * ═══ Por que mostra o veredito do motor, e não recalcula ═══
 *
 * O circuito já computa block rate/response rate e grava a decisão em
 * `channel_session_health` (+ o diagnóstico legível em `agent_inbox_items`). Esta
 * tela LÊ essa decisão. Recalcular aqui produziria um segundo número que poderia
 * divergir do que o motor de fato usou para segurar — e aí a tela mentiria. Uma
 * fonte de verdade só: a do motor.
 *
 * Server component: auth + leitura (RLS por org das tabelas do harness via
 * `fn_user_org_ids`). Só leitura — nenhuma escrita, nenhum efeito no envio.
 * Acesso: manager+.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { dayStartInTz } from "@/lib/agent-engine/pacing/engine";
import { classificar, type NumeroSaude } from "@/lib/campanhas/saude-dos-numeros";
import SaudeDosNumerosClient from "./_client";

export const dynamic = "force-dynamic";

/** O fuso do "hoje" exibido. O cliente é de MG; o teto diário real é por número, mas
 * a leitura visual de "enviadas hoje" fica no fuso de Brasília, declarado na tela. */
const FUSO_EXIBICAO = "America/Sao_Paulo";

interface CanalRow {
  id: string;
  phone_number: string | null;
  status: string | null;
  daily_message_limit: number | null;
  metadata: Record<string, unknown> | null;
}

interface HealthRow {
  channel_session_id: string;
  health_hold_active: boolean;
  health_hold_reason: string | null;
  health_held_at: string | null;
  health_released_at: string | null;
}

interface InboxRow {
  ref_id: string;
  body: string | null;
}

function rotuloDoCanal(c: CanalRow): string {
  const meta = c.metadata ?? {};
  const apelido =
    (typeof meta.apelido === "string" && meta.apelido.trim()) ||
    (typeof meta.label === "string" && meta.label.trim()) ||
    (typeof meta.nome === "string" && meta.nome.trim()) ||
    "";
  return apelido || c.phone_number || "Conexão sem nome";
}

async function carregar(organizationId: string): Promise<NumeroSaude[]> {
  const db = await createClient();

  const [{ data: canais }, { data: saude }, { data: inbox }] = await Promise.all([
    db
      .from("channel_sessions")
      .select("id, phone_number, status, daily_message_limit, metadata")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    db
      .from("channel_session_health")
      .select(
        "channel_session_id, health_hold_active, health_hold_reason, health_held_at, health_released_at",
      )
      .eq("organization_id", organizationId),
    db
      .from("agent_inbox_items")
      .select("ref_id, body")
      .eq("organization_id", organizationId)
      .eq("ref_kind", "number_health")
      .eq("status", "open"),
  ]);

  const canaisRows = (canais ?? []) as CanalRow[];
  const saudePorCanal = new Map<string, HealthRow>();
  for (const h of (saude ?? []) as HealthRow[]) saudePorCanal.set(h.channel_session_id, h);
  const diagPorCanal = new Map<string, string>();
  for (const i of (inbox ?? []) as InboxRow[]) {
    if (i.body && !diagPorCanal.has(i.ref_id)) diagPorCanal.set(i.ref_id, i.body);
  }

  // "Enviadas hoje" por número: contagem no pacing_ledger (o ledger de envios REAIS,
  // que a campanha também alimenta). Uma contagem por número — são poucos números.
  const inicioDoDia = dayStartInTz(new Date(), FUSO_EXIBICAO).toISOString();
  const enviadas = await Promise.all(
    canaisRows.map(async (c) => {
      const { count } = await db
        .from("pacing_ledger")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("channel_session_id", c.id)
        .gte("sent_at", inicioDoDia);
      return count ?? 0;
    }),
  );

  return canaisRows.map((c, i) => {
    const h = saudePorCanal.get(c.id);
    return {
      id: c.id,
      rotulo: rotuloDoCanal(c),
      telefone: c.phone_number,
      statusConexao: c.status ?? "—",
      saude: classificar(h),
      motivo: h?.health_hold_reason ?? null,
      desde: h?.health_held_at ?? null,
      diagnostico: diagPorCanal.get(c.id) ?? null,
      enviadasHoje: enviadas[i] ?? 0,
      tetoDiario: c.daily_message_limit,
    };
  });
}

export default async function SaudeDosNumerosPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const numeros = await carregar(org.orgId);

  return <SaudeDosNumerosClient numeros={numeros} fuso={FUSO_EXIBICAO} />;
}

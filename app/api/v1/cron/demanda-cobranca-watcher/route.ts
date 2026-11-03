/**
 * O VIGIA DA COBRANÇA — a demanda que o órgão não respondeu volta a pedir atenção.
 *
 * O gabinete manda ofício a um órgão (COPASA, CEMIG, Prefeitura…) e precisa cobrar
 * o que passou do prazo SEM resposta. Abrir a tela todo dia pra descobrir isso é o
 * tipo de coisa que não acontece — então o sistema varre sozinho e deixa UM aviso
 * na Central de Alertas (`pol_alerts`) por organização: "N atrasadas sem resposta".
 *
 * ═══ REGRA DE OURO (inviolável) ═══
 * Este vigia SÓ DETECTA E AVISA. Ele NUNCA envia nada — nem mensagem, nem e-mail,
 * nem ofício. Quem revisa, numera e envia o ofício de cobrança é SEMPRE uma pessoa
 * (Demandas › "Precisa cobrar" → "Gerar ofício de cobrança"). Isso é decisão do
 * cliente e blindagem eleitoral (TSE): máquina não dispara ato de gabinete.
 *
 * ═══ Por que UM alerta por org, e por que ele some sozinho ═══
 * Dedup: enquanto houver um alerta ABERTO deste tipo, a rodada só atualiza os
 * números nele — não nasce um segundo (alarme que repete treina a equipe a ignorá-lo).
 * E quando a org zera (nada mais atrasado sem resposta), o alerta aberto vai a
 * `resolved` — some da Central sem ninguém precisar fechar à mão.
 *
 * Semanal (segunda de manhã): o atraso conta em DIAS; varrer mais vezes só gastaria
 * consulta pra achar o mesmo. Varredura de banco, sem rede, sem IA.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { idsDeOrgsParadas } from "@/lib/organizacao/operante";
import { alertaCobranca, type DemandaCobranca } from "@/lib/politico/demanda-cobranca";

export const dynamic = "force-dynamic";

/** Teto da varredura por rodada (semanal; sobra improvável). */
const LIMITE = 5000;
/** Marca deste vigia em pol_alerts — o que permite dedup e limpeza. */
const SOURCE = "demanda_cobranca";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();

  // Candidatos à cobrança: demanda do gabinete, ainda aberta, SEM resposta do
  // órgão. O ATRASO é aplicado depois por alertaCobranca (puro). Fail-soft: numa
  // instalação sem a coluna pol_respondeu (migration 9084) a consulta falha — e
  // aí o vigia só se cala, não derruba nada.
  const { data, error } = await admin
    .from("demandas")
    .select("organization_id, pol_orgao_destino, estado, aberta_em, pol_prazo_dias")
    .eq("pol_gabinete", true)
    .eq("pol_respondeu", false)
    .not("estado", "in", "(resolvida,encerrada)")
    .limit(LIMITE);

  if (error) {
    logger.warn("[demanda-cobranca-watcher] consulta indisponível (fail-soft)", { error: error.message, requestId });
    return ok({ pulado: true, motivo: error.message }, { requestId });
  }

  // Agrupa por organização.
  const porOrg = new Map<string, DemandaCobranca[]>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const org = String(r.organization_id ?? "");
    if (!org) continue;
    const lista = porOrg.get(org) ?? [];
    lista.push({
      orgao: (r.pol_orgao_destino as string | null) ?? null,
      estado: String(r.estado ?? ""),
      abertaEm: String(r.aberta_em ?? new Date().toISOString()),
      prazoDias: (r.pol_prazo_dias as number | null) ?? null,
      respondeu: false,
    });
    porOrg.set(org, lista);
  }

  // Org suspensa/arquivada não é cutucada — nada de novo alerta pra quem não
  // opera (régua única de @/lib/organizacao/operante). Fail-soft: se a leitura
  // falhar, não paramos o vigia por isso.
  let paradas = new Set<string>();
  try {
    paradas = new Set(await idsDeOrgsParadas(admin));
  } catch (e) {
    logger.warn("[demanda-cobranca-watcher] não deu pra ler orgs paradas (seguindo sem o filtro)", {
      error: e instanceof Error ? e.message : String(e),
      requestId,
    });
  }

  let orgsAlertadas = 0;
  let orgsLimpas = 0;
  const comAlerta = new Set<string>();

  // Abre/atualiza UM alerta por org que tem demanda atrasada sem resposta.
  for (const [org, itens] of porOrg) {
    if (paradas.has(org)) continue;
    const al = alertaCobranca(itens);
    if (al.total === 0) continue; // tem demanda aberta, mas nenhuma atrasada ainda

    const titulo = `${al.total} demanda${al.total > 1 ? "s" : ""} atrasada${al.total > 1 ? "s" : ""} sem resposta do órgão`;
    const porOrgaoTxt = al.porOrgao.slice(0, 4).map((o) => `${o.orgao} (${o.qtd})`).join(", ");
    const descricao =
      `Passaram do prazo e o órgão ainda não respondeu: ${porOrgaoTxt}. ` +
      `Abra Demandas › "Precisa cobrar", revise e envie o ofício de cobrança. ` +
      `(Aviso automático — o envio é sempre feito por você.)`;

    const { data: aberto } = await admin
      .from("pol_alerts")
      .select("id")
      .eq("organization_id", org)
      .eq("source_type", SOURCE)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    const existente = aberto as { id: string } | null;

    if (existente) {
      const { error: eUp } = await admin
        .from("pol_alerts")
        .update({ title: titulo, description: descricao, severity: "high" })
        .eq("id", existente.id)
        .eq("organization_id", org);
      if (eUp) {
        logger.error("[demanda-cobranca-watcher] atualização do alerta falhou", { org, error: eUp.message, requestId });
        continue;
      }
    } else {
      const { error: eIns } = await admin.from("pol_alerts").insert({
        organization_id: org,
        alert_type: "custom",
        severity: "high",
        source_type: SOURCE,
        source_id: null,
        title: titulo,
        description: descricao,
        status: "open",
      });
      if (eIns) {
        logger.error("[demanda-cobranca-watcher] abertura do alerta falhou", { org, error: eIns.message, requestId });
        continue;
      }
    }
    comAlerta.add(org);
    orgsAlertadas += 1;
  }

  // Limpeza: alerta ABERTO deste vigia cuja org não tem mais nada atrasado sem
  // resposta (zerou, ou todas as demandas foram respondidas/fechadas e nem
  // aparecem na varredura) → vai a 'resolved' sozinho.
  const { data: abertos } = await admin
    .from("pol_alerts")
    .select("id, organization_id")
    .eq("source_type", SOURCE)
    .eq("status", "open");
  for (const a of (abertos ?? []) as { id: string; organization_id: string }[]) {
    if (comAlerta.has(a.organization_id)) continue;
    if (paradas.has(a.organization_id)) continue; // org parada: não mexe no que é dela
    const { error: eRes } = await admin
      .from("pol_alerts")
      .update({ status: "resolved" })
      .eq("id", a.id)
      .eq("organization_id", a.organization_id);
    if (eRes) {
      logger.error("[demanda-cobranca-watcher] limpeza do alerta falhou", { alerta: a.id, error: eRes.message, requestId });
      continue;
    }
    orgsLimpas += 1;
  }

  // Rodada sem efeito não audita (CLAUDE.md §Audit log).
  if (orgsAlertadas > 0 || orgsLimpas > 0) {
    await audit({
      action: "pol_gabinete.demanda_cobranca_vigiada",
      resourceType: "pol_alerts",
      requestId,
      metadata: { orgs_alertadas: orgsAlertadas, orgs_limpas: orgsLimpas, examinadas: porOrg.size },
    });
  }

  return ok({ orgs_alertadas: orgsAlertadas, orgs_limpas: orgsLimpas, examinadas: porOrg.size }, { requestId });
}

export const GET = handle;
export const POST = handle;

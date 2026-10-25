"use server";

/**
 * Gera o RELATÓRIO de Demandas do Gabinete em PDF (prestação de contas):
 * timbre da organização, KPIs, distribuição por status e a tabela de demandas
 * do gabinete (pol_gabinete=true). Salva no bucket privado `gabinete-anexos`
 * em {org}/relatorios/demandas.pdf (upsert) e devolve uma URL assinada.
 * Servidor-only (RLS pela sessão autenticada).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { marcaDaOrganizacaoParaPdf } from "@/lib/propostas/marca-da-organizacao-para-pdf";
import { renderRelatorioDemandasPdf, type RelatorioLinha } from "@/lib/politico/relatorio-pdf";

export type RelatorioResultado = { ok: true; url: string } | { ok: false; erro: string };

const ESTADO_LABEL: Record<string, string> = {
  aberta: "Nova",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando",
  resolvida: "Resolvida",
  encerrada: "Encerrada",
};
const ESTADO_COR: Record<string, string> = {
  aberta: "#F59E0B",
  em_atendimento: "#3B82F6",
  aguardando_cliente: "#FCD34D",
  resolvida: "#22C55E",
  encerrada: "#9CA3AF",
};
const ESTADOS = ["aberta", "em_atendimento", "aguardando_cliente", "resolvida", "encerrada"];

function dataBR(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

export async function gerarRelatorioDemandas(filtroEstado?: string): Promise<RelatorioResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const orgId = org.orgId;

  // Linhas (respeita o filtro de estado da tela, se houver).
  let q = db
    .from("demandas")
    .select("assunto, pol_tipo, pol_orgao_destino, estado, pol_prioridade, prazo_em, aberta_em, fechada_em")
    .eq("organization_id", orgId)
    .eq("pol_gabinete", true)
    .order("aberta_em", { ascending: false })
    .limit(2000);
  if (filtroEstado) q = q.eq("estado", filtroEstado);
  const { data: rows, error } = await q;
  if (error) return { ok: false, erro: "Erro ao carregar as demandas." };
  const demandas = (rows ?? []) as {
    assunto: string | null;
    pol_tipo: string | null;
    pol_orgao_destino: string | null;
    estado: string;
    pol_prioridade: string | null;
    prazo_em: string | null;
    aberta_em: string;
    fechada_em: string | null;
  }[];

  // KPIs + distribuição (sempre sobre TODAS as do gabinete, não só o filtro).
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const [totalRes, abertasRes, resolvidasMesRes, fechadasRes, ...distRes] = await Promise.all([
    db.from("demandas").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("pol_gabinete", true),
    db
      .from("demandas")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("pol_gabinete", true)
      .not("estado", "in", "(resolvida,encerrada)"),
    db
      .from("demandas")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("pol_gabinete", true)
      .eq("estado", "resolvida")
      .gte("aberta_em", inicioMes.toISOString()),
    db
      .from("demandas")
      .select("aberta_em, fechada_em")
      .eq("organization_id", orgId)
      .eq("pol_gabinete", true)
      .not("fechada_em", "is", null)
      .limit(500),
    ...ESTADOS.map((e) =>
      db.from("demandas").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("pol_gabinete", true).eq("estado", e),
    ),
  ]);

  const fechadas = (fechadasRes.data ?? []) as { aberta_em: string; fechada_em: string }[];
  const tempoMedioDias =
    fechadas.length > 0
      ? Math.round(
          (fechadas.reduce((s, d) => s + (new Date(d.fechada_em).getTime() - new Date(d.aberta_em).getTime()), 0) / fechadas.length / 86_400_000) * 10,
        ) / 10
      : null;

  const statusDist = ESTADOS.map((e, i) => ({ label: ESTADO_LABEL[e] ?? e, count: distRes[i]?.count ?? 0, cor: ESTADO_COR[e] ?? "#9CA3AF" })).filter(
    (x) => x.count > 0,
  );

  const linhas: RelatorioLinha[] = demandas.map((d) => ({
    assunto: (d.assunto ?? "Sem assunto").slice(0, 90),
    tipo: d.pol_tipo ? d.pol_tipo.replace(/_/g, " ") : "—",
    orgao: d.pol_orgao_destino ?? "—",
    status: ESTADO_LABEL[d.estado] ?? d.estado,
    prioridade: d.pol_prioridade && d.pol_prioridade !== "normal" ? d.pol_prioridade : "normal",
    prazo: dataBR(d.prazo_em),
    aberta: dataBR(d.aberta_em),
  }));

  // ── Leitura do período (análise) ───────────────────────────────────────────
  const total = totalRes.count ?? 0;
  const concluidas = (distRes[3]?.count ?? 0) + (distRes[4]?.count ?? 0); // resolvida + encerrada
  const taxaResolucao = total > 0 ? Math.round((concluidas / total) * 100) : 0;
  const altaAbertas = demandas.filter(
    (d) => d.pol_prioridade === "alta" && d.estado !== "resolvida" && d.estado !== "encerrada",
  ).length;
  const orgaoContagem = new Map<string, number>();
  for (const d of demandas) {
    const o = d.pol_orgao_destino?.trim();
    if (o) orgaoContagem.set(o, (orgaoContagem.get(o) ?? 0) + 1);
  }
  const orgaoTop = [...orgaoContagem.entries()].sort((a, b) => b[1] - a[1])[0];

  const analise: string[] = [];
  if (total > 0) {
    analise.push(`Taxa de resolução de ${taxaResolucao}% — ${concluidas} de ${total} demanda(s) concluída(s).`);
  }
  if (tempoMedioDias !== null) {
    const ritmo = tempoMedioDias <= 3 ? "um ritmo ágil de atendimento" : tempoMedioDias <= 10 ? "dentro de um prazo saudável" : "um prazo que merece atenção";
    analise.push(`Tempo médio de atendimento de ${tempoMedioDias} dia(s), ${ritmo}.`);
  }
  if (altaAbertas > 0) {
    analise.push(`${altaAbertas} demanda(s) de alta prioridade ainda em aberto — foco imediato da equipe.`);
  }
  if (orgaoTop) {
    analise.push(`Órgão mais acionado: ${orgaoTop[0]} (${orgaoTop[1]} demanda(s)).`);
  }

  // Identidade (timbre) — mesma régua do ofício.
  const marca = await marcaDaOrganizacaoParaPdf(db, orgId);
  const admin = createAdminClient();
  const { data: cfg } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, subtitulo, logo_path")
    .eq("organization_id", orgId)
    .maybeSingle();
  const ident = (cfg ?? null) as { nome_parlamentar: string | null; subtitulo: string | null; logo_path: string | null } | null;
  let logoUrl = marca.logoUrl;
  if (ident?.logo_path) {
    const { data: s } = await admin.storage.from("gabinete-identidade").createSignedUrl(ident.logo_path, 60 * 60);
    if (s?.signedUrl) logoUrl = s.signedUrl;
  }

  let buffer: Buffer;
  try {
    buffer = await renderRelatorioDemandasPdf({
      nome: ident?.nome_parlamentar ?? marca.appName,
      subtitulo: ident?.subtitulo ?? null,
      logoUrl,
      accentHex: marca.accentHex,
      geradoEm: new Date().toISOString(),
      filtroLabel: filtroEstado ? ESTADO_LABEL[filtroEstado] ?? filtroEstado : "Todas",
      kpis: {
        total: totalRes.count ?? 0,
        abertas: abertasRes.count ?? 0,
        resolvidasMes: resolvidasMesRes.count ?? 0,
        tempoMedioDias,
      },
      statusDist,
      linhas,
      analise,
    });
  } catch {
    return { ok: false, erro: "Falha ao renderizar o relatório." };
  }

  const path = `${orgId}/relatorios/demandas.pdf`;
  const up = await admin.storage.from("gabinete-anexos").upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, erro: "Erro ao salvar o relatório." };
  const { data: signed } = await admin.storage.from("gabinete-anexos").createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return { ok: false, erro: "Relatório gerado, mas falhou ao assinar o link." };
  return { ok: true, url: signed.signedUrl };
}

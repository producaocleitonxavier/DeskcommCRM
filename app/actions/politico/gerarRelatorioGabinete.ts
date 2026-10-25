"use server";

/**
 * Gera um RELATÓRIO genérico do Gabinete em PDF (prestação de contas) para as
 * telas de Lideranças, Emendas e Projetos de Lei. Recebe do cliente o conteúdo
 * JÁ FORMATADO (os mesmos dados que a pessoa vê na tela) — título, KPIs,
 * colunas e linhas — e aplica o TIMBRE da organização (nome/logo do
 * parlamentar) resolvido no SERVIDOR. Salva no bucket privado `gabinete-anexos`
 * em {org}/relatorios/{slug}.pdf (upsert) e devolve uma URL assinada.
 *
 * O conteúdo vem do cliente porque é um retrato do que já está na tela daquela
 * organização; a AUTORIZAÇÃO e o caminho de storage saem SÓ da sessão (org por
 * resolveActiveOrg, nunca do corpo). Limites de tamanho evitam payload abusivo.
 */

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { marcaDaOrganizacaoParaPdf } from "@/lib/propostas/marca-da-organizacao-para-pdf";
import { renderRelatorioGabinetePdf } from "@/lib/politico/relatorio-gabinete-pdf";

export type RelatorioResultado = { ok: true; url: string } | { ok: false; erro: string };

const SLUGS = ["liderancas", "emendas", "projetos"] as const;

const corHex = z.string().trim().regex(/^#?[0-9a-fA-F]{6}$/);

const colunaSchema = z.object({
  header: z.string().trim().min(1).max(60),
  largura: z.string().trim().regex(/^\d{1,3}(\.\d+)?%$/),
  pilula: z.boolean().optional(),
});

const barraSchema = z.object({
  label: z.string().trim().max(60),
  valor: z.string().trim().max(40),
  pct: z.number().min(0).max(100),
  cor: corHex,
});

const inputSchema = z.object({
  slug: z.enum(SLUGS),
  titulo: z.string().trim().min(2).max(80),
  resumo: z.string().trim().max(160).nullish(),
  kpis: z.array(z.object({ num: z.string().max(24), label: z.string().max(40) })).max(8),
  colunas: z.array(colunaSchema).min(1).max(14),
  linhas: z.array(z.array(z.string().max(200)).max(14)).max(3000),
  // Leitura analítica do período (a caixa de destaque).
  analise: z.array(z.string().trim().max(240)).max(8).optional(),
  // Barras de distribuição (ex.: valor por área).
  distribuicoes: z.object({ titulo: z.string().trim().max(60), itens: z.array(barraSchema).max(12) }).optional(),
  // Mapa valor→cor para colunas com `pilula`.
  coresPilula: z.record(z.string().max(60), corHex).optional(),
});

export type RelatorioGabineteInputCliente = z.input<typeof inputSchema>;

export async function gerarRelatorioGabinete(bruto: RelatorioGabineteInputCliente): Promise<RelatorioResultado> {
  const parsed = inputSchema.safeParse(bruto);
  if (!parsed.success) return { ok: false, erro: "Dados do relatório inválidos." };
  const input = parsed.data;

  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const orgId = org.orgId;

  // Identidade (timbre) — mesma régua do ofício e do relatório de demandas.
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
    buffer = await renderRelatorioGabinetePdf({
      nome: ident?.nome_parlamentar ?? marca.appName,
      subtitulo: ident?.subtitulo ?? null,
      logoUrl,
      accentHex: marca.accentHex,
      geradoEm: new Date().toISOString(),
      titulo: input.titulo,
      resumo: input.resumo ?? null,
      kpis: input.kpis,
      colunas: input.colunas,
      linhas: input.linhas,
      analise: input.analise,
      distribuicoes: input.distribuicoes,
      coresPilula: input.coresPilula,
    });
  } catch {
    return { ok: false, erro: "Falha ao renderizar o relatório." };
  }

  const path = `${orgId}/relatorios/${input.slug}.pdf`;
  const up = await admin.storage.from("gabinete-anexos").upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, erro: "Erro ao salvar o relatório." };
  const { data: signed } = await admin.storage.from("gabinete-anexos").createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return { ok: false, erro: "Relatório gerado, mas falhou ao assinar o link." };
  return { ok: true, url: signed.signedUrl };
}

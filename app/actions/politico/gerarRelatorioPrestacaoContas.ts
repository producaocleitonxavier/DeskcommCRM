"use server";

/**
 * Gera o RELATÓRIO de PRESTAÇÃO DE CONTAS do mandato em PDF: timbre da
 * organização + os números do mandato (demandas, ofícios, obras, emendas,
 * base) + evolução + bairros. Mesma fonte de dados da tela
 * (`lib/politico/prestacao-contas-dados`). Salva em `gabinete-anexos`
 * {org}/relatorios/prestacao-contas.pdf (upsert) e devolve URL assinada.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { marcaDaOrganizacaoParaPdf } from "@/lib/propostas/marca-da-organizacao-para-pdf";
import { buscarPrestacaoContas, normalizarPeriodo, PERIODO_LABEL } from "@/lib/politico/prestacao-contas-dados";
import { renderRelatorioPrestacaoContasPdf } from "@/lib/politico/prestacao-pdf";

export type RelatorioResultado = { ok: true; url: string } | { ok: false; erro: string };

export async function gerarRelatorioPrestacaoContas(periodoRaw?: string): Promise<RelatorioResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const orgId = org.orgId;
  const periodo = normalizarPeriodo(periodoRaw);

  const dados = await buscarPrestacaoContas(orgId, periodo);

  const db = await createClient();
  const admin = createAdminClient();
  const marca = await marcaDaOrganizacaoParaPdf(db, orgId);
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
    buffer = await renderRelatorioPrestacaoContasPdf({
      nome: ident?.nome_parlamentar ?? marca.appName,
      subtitulo: ident?.subtitulo ?? null,
      logoUrl,
      accentHex: marca.accentHex,
      geradoEm: new Date().toISOString(),
      periodoLabel: PERIODO_LABEL[periodo],
      dados,
    });
  } catch {
    return { ok: false, erro: "Falha ao renderizar o relatório." };
  }

  const path = `${orgId}/relatorios/prestacao-contas.pdf`;
  const up = await admin.storage.from("gabinete-anexos").upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, erro: "Erro ao salvar o relatório." };
  const { data: signed } = await admin.storage.from("gabinete-anexos").createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return { ok: false, erro: "Relatório gerado, mas falhou ao assinar o link." };
  return { ok: true, url: signed.signedUrl };
}

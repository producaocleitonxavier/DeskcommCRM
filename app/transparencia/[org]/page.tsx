/**
 * /transparencia/[org] — Portal da Transparência PÚBLICO do mandato (sem auth).
 *
 * Vitrine de prestação de contas: obras (visibilidade='publica') com mapa de
 * entregas + emendas (publica=true) com valor aplicado. Opt-in por registro —
 * nada aparece sem o operador marcar. Gate geral: pol_gabinete_config.portal_ativo.
 * Resolve tudo no servidor (admin client). Portal desligado/inexistente → 404.
 */

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { env } from "@/lib/env";
import PortalTransparenciaClient, { type ObraPublica, type EmendaPublica } from "./_client";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PortalTransparenciaPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgId } = await params;
  if (!UUID.test(orgId)) notFound();

  const admin = createAdminClient();

  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, logo_path, portal_ativo")
    .eq("organization_id", orgId)
    .maybeSingle();
  const ident = (cfg ?? null) as { nome_parlamentar: string | null; cargo: string | null; logo_path: string | null; portal_ativo: boolean | null } | null;

  // Portal desligado ou sem configuração → não existe publicamente.
  if (!ident || !ident.portal_ativo) notFound();

  let logoUrl: string | null = null;
  if (ident.logo_path) {
    const { data: signed } = await admin.storage.from("gabinete-identidade").createSignedUrl(ident.logo_path, 60 * 60);
    logoUrl = signed?.signedUrl ?? null;
  }

  const [obrasRes, emendasRes] = await Promise.all([
    admin
      .from("pol_obras")
      .select("id, titulo, objeto, status, percentual, area_tematica, municipio, bairro, latitude, longitude, valor_cents, data_prevista")
      .eq("organization_id", orgId)
      .eq("visibilidade", "publica")
      .neq("status", "cancelada")
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("pol_emendas")
      .select("id, numero, ano, entidade_beneficiada, objeto, descricao, area_tematica, municipio, bairro, valor_pago_cents, valor_indicado_cents, status, data_pagamento")
      .eq("organization_id", orgId)
      .eq("publica", true)
      .order("data_pagamento", { ascending: false, nullsFirst: false })
      .limit(500),
  ]);

  const obras = ((obrasRes.data ?? []) as Record<string, unknown>[]).map((o) => ({
    id: o.id as string,
    titulo: o.titulo as string,
    objeto: (o.objeto as string | null) ?? null,
    status: o.status as string,
    percentual: (o.percentual as number | null) ?? null,
    areaTematica: (o.area_tematica as string | null) ?? null,
    municipio: (o.municipio as string | null) ?? null,
    bairro: (o.bairro as string | null) ?? null,
    latitude: o.latitude != null ? Number(o.latitude) : null,
    longitude: o.longitude != null ? Number(o.longitude) : null,
    valorCents: (o.valor_cents as number | null) ?? 0,
    dataPrevista: (o.data_prevista as string | null) ?? null,
  })) as ObraPublica[];

  const emendas = ((emendasRes.data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: e.id as string,
    numero: (e.numero as string | null) ?? null,
    ano: (e.ano as number | null) ?? null,
    entidade: (e.entidade_beneficiada as string | null) ?? null,
    objeto: (e.objeto as string | null) ?? (e.descricao as string | null) ?? null,
    areaTematica: (e.area_tematica as string | null) ?? null,
    municipio: (e.municipio as string | null) ?? null,
    bairro: (e.bairro as string | null) ?? null,
    valorPagoCents: (e.valor_pago_cents as number | null) ?? 0,
    valorIndicadoCents: (e.valor_indicado_cents as number | null) ?? 0,
    status: e.status as string,
    dataPagamento: (e.data_pagamento as string | null) ?? null,
  })) as EmendaPublica[];

  const linha = await marcaDaInstalacao();
  const plataformaNome = (linha?.app_name ?? env.APP_NAME ?? "").trim() || null;

  return (
    <PortalTransparenciaClient
      politicoNome={(ident.nome_parlamentar ?? "").trim() || null}
      politicoCargo={(ident.cargo ?? "").trim() || null}
      logoUrl={logoUrl}
      plataformaNome={plataformaNome}
      obras={obras}
      emendas={emendas}
    />
  );
}

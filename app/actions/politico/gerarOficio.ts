"use server";

/**
 * Gera o OFÍCIO da demanda em PDF (Gabinete). O corpo é o texto do
 * encaminhamento (IA ou manual); o timbre é a marca da ORGANIZAÇÃO. O número é
 * atribuído na primeira emissão (sequencial por org/ano) e fica estável. O PDF
 * é salvo no bucket privado `gabinete-anexos` e vira um anexo da demanda (uma
 * linha de ofício por demanda), devolvendo uma URL assinada para abrir/imprimir.
 *
 * Roda no servidor: o browser client não vê a sessão (cookie httpOnly) e a RLS
 * devolveria vazio. Posse pela RLS de `demandas` + filtro explícito de org.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { marcaDaOrganizacaoParaPdf } from "@/lib/propostas/marca-da-organizacao-para-pdf";
import { renderOficioPdf } from "@/lib/politico/oficio-pdf";

const BUCKET = "gabinete-anexos";

export type OficioResultado =
  | { ok: true; url: string; numero: number; ano: number }
  | { ok: false; erro: string };

export async function gerarOficioDemanda(demandaId: string): Promise<OficioResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data: dem, error } = await db
    .from("demandas")
    .select("id, pol_encaminhamento_ia, pol_orgao_destino, pol_oficio_numero, pol_oficio_ano")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (error) return { ok: false, erro: "Erro ao carregar a demanda." };
  if (!dem) return { ok: false, erro: "Demanda não encontrada." };
  const d = dem as {
    pol_encaminhamento_ia: string | null;
    pol_orgao_destino: string | null;
    pol_oficio_numero: number | null;
    pol_oficio_ano: number | null;
  };

  const corpo = (d.pol_encaminhamento_ia ?? "").trim();
  if (!corpo) return { ok: false, erro: "Gere ou escreva o encaminhamento antes de emitir o ofício." };

  // Número: atribui na primeira emissão (sequencial por org/ano) e persiste.
  const agora = new Date();
  let numero = d.pol_oficio_numero;
  let ano = d.pol_oficio_ano;
  if (!numero || !ano) {
    ano = agora.getFullYear();
    const { data: ult } = await db
      .from("demandas")
      .select("pol_oficio_numero")
      .eq("organization_id", org.orgId)
      .eq("pol_oficio_ano", ano)
      .not("pol_oficio_numero", "is", null)
      .order("pol_oficio_numero", { ascending: false })
      .limit(1)
      .maybeSingle();
    numero = ((ult?.pol_oficio_numero as number | null) ?? 0) + 1;
    const upd = await db
      .from("demandas")
      .update({ pol_oficio_numero: numero, pol_oficio_ano: ano })
      .eq("id", demandaId)
      .eq("organization_id", org.orgId);
    if (upd.error) return { ok: false, erro: "Não consegui numerar o ofício." };
  }

  const marca = await marcaDaOrganizacaoParaPdf(db, org.orgId);
  let buffer: Buffer;
  try {
    buffer = await renderOficioPdf({
      numero,
      ano,
      corpo,
      orgao: d.pol_orgao_destino ?? null,
      cidade: null,
      dataISO: agora.toISOString(),
      marca: { appName: marca.appName, accentHex: marca.accentHex, logoUrl: marca.logoUrl },
    });
  } catch {
    return { ok: false, erro: "Falha ao renderizar o PDF do ofício." };
  }

  const admin = createAdminClient();
  const path = `${org.orgId}/${demandaId}/oficio.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, erro: "Erro ao salvar o ofício no armazenamento." };

  // Uma linha de ofício por demanda (identificada pelo storage_path fixo).
  const nome = `Ofício ${String(numero).padStart(3, "0")}-${ano}.pdf`;
  const { data: existente } = await db
    .from("pol_demanda_anexos")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", demandaId)
    .eq("storage_path", path)
    .maybeSingle();
  if (existente?.id) {
    await admin
      .from("pol_demanda_anexos")
      .update({ nome_arquivo: nome, media_size_bytes: buffer.length })
      .eq("id", (existente as { id: string }).id);
  } else {
    await admin.from("pol_demanda_anexos").insert({
      organization_id: org.orgId,
      demanda_id: demandaId,
      storage_path: path,
      nome_arquivo: nome,
      media_mime: "application/pdf",
      media_size_bytes: buffer.length,
      created_by: user.id,
    });
  }

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return { ok: false, erro: "Ofício gerado, mas falhou ao assinar o link." };
  return { ok: true, url: signed.signedUrl, numero, ano };
}

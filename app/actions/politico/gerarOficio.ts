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

import { autenticarComPapel } from "@/lib/politico/acesso";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { identidadeDoOficio } from "@/lib/politico/identidade-do-oficio";
import { renderOficioPdf } from "@/lib/politico/oficio-pdf";
import { caminhoPertenceAOrg } from "@/lib/storage/caminho-da-org";

const BUCKET = "gabinete-anexos";

export type OficioResultado =
  | { ok: true; url: string; rotulo: string }
  | { ok: false; erro: string };

export async function gerarOficioDemanda(demandaId: string): Promise<OficioResultado> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  // GABINETE-ONLY (trava de SERVIDOR, não só da tela): só emite ofício quem tem
  // "Ofícios" no menu (perfil gabinete). Rua e gabinete são o mesmo papel (agent)
  // → o menu distingue. A UI já esconde a seção; aqui ninguém força por fora.
  const ehPlataforma = !!user.is_platform_admin && !user.support;
  const podeOficio = destinosDaInterface(org.interface_settings, ehPlataforma, org.role).some(
    (dst) => dst.href === "/app/politico/oficios",
  );
  if (!podeOficio) return { ok: false, erro: "O ofício é emitido pelo gabinete — você não tem acesso a esta ação." };

  const db = await createClient();

  const { data: dem, error } = await db
    .from("demandas")
    .select("id, pol_encaminhamento_ia, pol_orgao_destino, pol_oficio_rotulo, pol_oficio_destinatario, pol_oficio_assunto")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (error) return { ok: false, erro: "Erro ao carregar a demanda." };
  if (!dem) return { ok: false, erro: "Demanda não encontrada." };
  const d = dem as {
    pol_encaminhamento_ia: string | null;
    pol_orgao_destino: string | null;
    pol_oficio_rotulo: string | null;
    pol_oficio_destinatario: string | null;
    pol_oficio_assunto: string | null;
  };

  const corpo = (d.pol_encaminhamento_ia ?? "").trim();
  if (!corpo) return { ok: false, erro: "Gere ou escreva o encaminhamento antes de emitir o ofício." };

  // Número MANUAL: cada gabinete tem o seu método, o sistema não decide. Sem o
  // número preenchido, não emite (nunca inventa um número).
  const rotulo = (d.pol_oficio_rotulo ?? "").trim();
  if (!rotulo) {
    return { ok: false, erro: "Informe o número do ofício (cada gabinete usa a sua numeração) antes de gerar." };
  }
  const destinatario = (d.pol_oficio_destinatario ?? "").trim() || null;
  const agora = new Date();

  const admin = createAdminClient();
  // Identidade do gabinete (nome, cargo, timbrado, assinatura) — a mesma do requerimento.
  const ident = await identidadeDoOficio(db, admin, org.orgId);

  // Fotos anexadas à demanda (JPG/PNG) → uma PÁGINA EXTRA por foto, no timbrado.
  // Só jpeg/png: são os formatos que o @react-pdf renderiza com segurança (um
  // webp/heic quebraria o render inteiro). As imagens vêm do MESMO bucket do
  // ofício (gabinete-anexos), por URL assinada.
  const anexosImagens: { url: string; nome: string }[] = [];
  const { data: fotos } = await db
    .from("pol_demanda_anexos")
    .select("storage_path, nome_arquivo, media_mime, created_at")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", demandaId)
    .in("media_mime", ["image/jpeg", "image/jpg", "image/png"])
    .order("created_at", { ascending: true });
  for (const f of (fotos ?? []) as { storage_path: string; nome_arquivo: string | null }[]) {
    if (!caminhoPertenceAOrg(f.storage_path, org.orgId)) continue;
    const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(f.storage_path, 60 * 60);
    if (s?.signedUrl) anexosImagens.push({ url: s.signedUrl, nome: (f.nome_arquivo ?? "").trim() });
  }

  let buffer: Buffer;
  try {
    buffer = await renderOficioPdf({
      numero: 0,
      ano: agora.getFullYear(),
      numeroLabel: rotulo,
      destinatario,
      destinatarioPosicao: ident.destinatarioPosicao,
      assunto: (d.pol_oficio_assunto ?? "").trim() || null,
      corpo,
      orgao: d.pol_orgao_destino ?? null,
      cidade: ident.cidade,
      dataISO: agora.toISOString(),
      nome: ident.nome,
      subtitulo: ident.subtitulo,
      cargo: ident.cargo,
      assinaturaUrl: ident.assinaturaUrl,
      assinaturaModo: ident.assinaturaModo,
      timbradoUrl: ident.timbradoUrl,
      timbradoMargens: ident.timbradoMargens,
      anexosImagens,
      marca: ident.marca,
    });
  } catch {
    return { ok: false, erro: "Falha ao renderizar o PDF do ofício." };
  }

  const path = `${org.orgId}/${demandaId}/oficio.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, erro: "Erro ao salvar o ofício no armazenamento." };

  // Uma linha de ofício por demanda (identificada pelo storage_path fixo).
  const nomeSan = rotulo.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
  const nome = `Ofício ${nomeSan}.pdf`;
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

  // Histórico: ofício emitido (uma vez; reemissões não poluem a timeline).
  const { data: jaEmitido } = await db
    .from("pol_demanda_eventos")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", demandaId)
    .eq("tipo", "oficio_emitido")
    .limit(1)
    .maybeSingle();
  if (!jaEmitido) {
    await db.from("pol_demanda_eventos").insert({
      organization_id: org.orgId,
      demanda_id: demandaId,
      tipo: "oficio_emitido",
      descricao: `Ofício ${rotulo} emitido`,
      created_by: user.id,
    });
  }

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return { ok: false, erro: "Ofício gerado, mas falhou ao assinar o link." };
  return { ok: true, url: signed.signedUrl, rotulo };
}

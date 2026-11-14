"use server";

/**
 * RELATÓRIO DE VISITA TÉCNICA em PDF, no papel timbrado do gabinete.
 *
 * Sai do que a equipe já registrou na visita (data, local, presentes, relato,
 * encaminhamentos) + as fotos anexadas, uma por página. Sem IA: o relatório diz o
 * que foi registrado. Fica guardado nos anexos da visita; nada é enviado a ninguém.
 *
 * Acesso: documento do gabinete — a mesma régua do ofício (gestor para cima, ou
 * atendente com a porta "Ofícios" no menu). Organização sempre da sessão.
 */

import { audit } from "@/lib/audit";
import { ROLE_RANK } from "@/lib/auth/types";
import { resolveActiveOrg } from "@/lib/auth/server";
import { supportWriteError } from "@/lib/impersonate/support";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { autenticarComPapel } from "@/lib/politico/acesso";
import { identidadeDoOficio } from "@/lib/politico/identidade-do-oficio";
import { renderOficioPdf } from "@/lib/politico/oficio-pdf";
import { montarRelatorioDeVisita, problemaDoRelatorioDeVisita } from "@/lib/politico/relatorio-de-visita";
import { caminhoPertenceAOrg } from "@/lib/storage/caminho-da-org";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "gabinete-anexos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RelatorioDeVisitaResultado = { ok: true; url: string } | { ok: false; erro: string };

export async function gerarRelatorioDeVisita(demandaId: string): Promise<RelatorioDeVisitaResultado> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const ehPlataforma = !!user.is_platform_admin && !user.support;
  const pode =
    ehPlataforma ||
    ROLE_RANK[org.role] >= ROLE_RANK.manager ||
    destinosDaInterface(org.interface_settings, ehPlataforma, org.role).some((d) => d.href === "/app/politico/oficios");
  if (!pode) return { ok: false, erro: "O relatório em PDF é emitido pelo gabinete — você não tem acesso a esta ação." };
  if (supportWriteError(user.support)) return { ok: false, erro: "A conta de suporte só consulta; não grava." };
  if (!UUID.test(String(demandaId))) return { ok: false, erro: "Visita não encontrada." };

  const db = await createClient();
  // Posse: RLS de `demandas` + filtro explícito de organização.
  const { data, error } = await db
    .from("demandas")
    .select(
      "id, assunto, pol_orgao_destino, pol_municipio, pol_visita_realizada_em, pol_visita_relato, pol_visita_presentes, pol_visita_decisoes, pol_visita_relato_por_nome",
    )
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (error) return { ok: false, erro: "Erro ao carregar a visita." };
  if (!data) return { ok: false, erro: "Visita não encontrada." };
  const v = data as {
    id: string;
    assunto: string | null;
    pol_orgao_destino: string | null;
    pol_municipio: string | null;
    pol_visita_realizada_em: string | null;
    pol_visita_relato: string | null;
    pol_visita_presentes: string | null;
    pol_visita_decisoes: string | null;
    pol_visita_relato_por_nome: string | null;
  };
  // O local da ocorrência é coluna mais nova (9098): lido à parte, para a instalação que ainda
  // não a tem gerar o relatório sem o local em vez de falhar.
  const { data: localRow } = await db.from("demandas").select("pol_local_ocorrencia").eq("organization_id", org.orgId).eq("id", v.id).maybeSingle();
  const local = (localRow as { pol_local_ocorrencia?: string | null } | null)?.pol_local_ocorrencia ?? null;
  const dados = {
    assunto: v.assunto,
    orgao: v.pol_orgao_destino,
    municipio: v.pol_municipio,
    local,
    realizadaEm: v.pol_visita_realizada_em,
    presentes: v.pol_visita_presentes,
    relato: v.pol_visita_relato,
    decisoes: v.pol_visita_decisoes,
    relatoPor: v.pol_visita_relato_por_nome,
  };
  const problema = problemaDoRelatorioDeVisita(dados);
  if (problema) return { ok: false, erro: problema };

  const admin = createAdminClient();
  const ident = await identidadeDoOficio(db, admin, org.orgId);

  // Fotos da visita (JPG/PNG) → uma página extra por foto, no mesmo papel.
  const anexosImagens: { url: string; nome: string }[] = [];
  const { data: fotos } = await db
    .from("pol_demanda_anexos")
    .select("storage_path, nome_arquivo, media_mime, created_at")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", v.id)
    .in("media_mime", ["image/jpeg", "image/jpg", "image/png"])
    .order("created_at", { ascending: true })
    .limit(12);
  for (const f of (fotos ?? []) as { storage_path: string; nome_arquivo: string | null }[]) {
    if (!caminhoPertenceAOrg(f.storage_path, org.orgId)) continue;
    const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(f.storage_path, 60 * 60);
    if (s?.signedUrl) anexosImagens.push({ url: s.signedUrl, nome: (f.nome_arquivo ?? "").trim() });
  }

  const agora = new Date();
  let buffer: Buffer;
  try {
    buffer = await renderOficioPdf({
      modelo: "requerimento",
      titulo: "RELATÓRIO DE VISITA TÉCNICA",
      numero: 0,
      ano: agora.getFullYear(),
      corpo: montarRelatorioDeVisita(dados),
      orgao: null,
      cidade: ident.cidade,
      dataISO: agora.toISOString(),
      nome: ident.nome,
      subtitulo: ident.subtitulo,
      cargo: ident.cargo,
      assinaturaUrl: ident.assinaturaUrl,
      assinaturaModo: ident.assinaturaModo,
      assinaturaLinhas: ident.assinaturaLinhas,
      timbradoUrl: ident.timbradoUrl,
      timbradoMargens: ident.timbradoMargens,
      anexosImagens,
      marca: ident.marca,
    });
  } catch {
    return { ok: false, erro: "Falha ao montar o PDF do relatório." };
  }

  // Um relatório por visita (o id vem do BANCO): gerar de novo substitui o anterior.
  const path = `${org.orgId}/${v.id}/relatorio-de-visita.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, erro: "Erro ao guardar o relatório." };

  const nome = "Relatório de visita técnica.pdf";
  // `limit(1)`, não `maybeSingle()`: se por corrida já houver duas linhas do mesmo arquivo, a busca
  // não pode falhar e criar a terceira. Erro de leitura para aqui — nunca insere às cegas.
  const { data: existentes, error: errBusca } = await db
    .from("pol_demanda_anexos")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", v.id)
    .eq("storage_path", path)
    .order("created_at", { ascending: true })
    .limit(1);
  if (errBusca) return { ok: false, erro: "O relatório foi montado, mas não consegui guardá-lo na visita. Tente de novo." };
  const existente = (existentes ?? [])[0] as { id: string } | undefined;
  const gravacao = existente?.id
    ? await admin
        .from("pol_demanda_anexos")
        .update({ nome_arquivo: nome, media_size_bytes: buffer.length })
        .eq("organization_id", org.orgId)
        .eq("id", existente.id)
    : await admin.from("pol_demanda_anexos").insert({
        organization_id: org.orgId,
        demanda_id: v.id,
        storage_path: path,
        nome_arquivo: nome,
        media_mime: "application/pdf",
        media_size_bytes: buffer.length,
        created_by: user.id,
      });
  if (gravacao.error) return { ok: false, erro: "O relatório foi montado, mas não consegui guardá-lo na visita. Tente de novo." };

  await audit({
    action: "pol_gabinete.relatorio_de_visita_gerado",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "demandas",
    resourceId: v.id,
    metadata: { fotos: anexosImagens.length, refeito: !!existente?.id },
  });

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return { ok: false, erro: "Relatório guardado, mas falhou ao abrir o link." };
  return { ok: true, url: signed.signedUrl };
}

"use server";

/**
 * REQUERIMENTO DE COMISSÃO em PDF (visita técnica ou audiência pública).
 *
 * O texto é redigido pela IA (`gerarRequerimentoDeComissao`) e REVISADO pela
 * equipe na tela; esta ação pega o texto revisado, imprime no MESMO papel do
 * ofício (timbrado, margens e assinatura do gabinete) e guarda o PDF junto da
 * visita, como anexo. Nada é enviado a ninguém: o requerimento é protocolado
 * no sistema da Casa.
 *
 * A comissão e o artigo do regimento são de cada Casa: ficam guardados como
 * configuração do gabinete (`organizations.settings.gabinete.requerimento`),
 * para a equipe inteira não ter de digitar de novo.
 */

import { autenticarComPapel } from "@/lib/politico/acesso";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActiveOrg } from "@/lib/auth/server";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { identidadeDoOficio } from "@/lib/politico/identidade-do-oficio";
import { renderOficioPdf } from "@/lib/politico/oficio-pdf";
import { limparTextoOficial } from "@/lib/politico/redacao-oficial";
import {
  configDoRequerimentoDeSettings,
  problemaDoTextoDoRequerimento,
  tituloDoRequerimento,
  type ConfigDoRequerimento,
  type TipoDoRequerimentoPdf,
} from "@/lib/politico/requerimento-pdf";

const BUCKET = "gabinete-anexos";

type Sessao = { user: Awaited<ReturnType<typeof autenticarComPapel>>; org: NonNullable<Awaited<ReturnType<typeof resolveActiveOrg>>> };

/** Documento do gabinete: a mesma trava de SERVIDOR do ofício (quem tem "Ofícios" no menu). */
function podeEmitir({ user, org }: Sessao): boolean {
  const ehPlataforma = !!user.is_platform_admin && !user.support;
  return destinosDaInterface(org.interface_settings, ehPlataforma, org.role).some((dst) => dst.href === "/app/politico/oficios");
}

/**
 * A comissão e o artigo que o gabinete usou da última vez ("" quando nunca usou) e se
 * ESTA pessoa pode gerar o PDF — para a tela não oferecer um botão que sempre recusa.
 */
export async function lerConfigDoRequerimento(): Promise<ConfigDoRequerimento & { podePdf: boolean }> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { comissao: "", dispositivo: "", podePdf: false };
  const db = await createClient();
  const { data } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  return { ...configDoRequerimentoDeSettings((data as { settings?: unknown } | null)?.settings), podePdf: podeEmitir({ user, org }) };
}

export type RequerimentoPdfResultado = { ok: true; url: string; nome: string } | { ok: false; erro: string };

export async function emitirRequerimentoPdf(
  demandaId: string,
  pedido: { tipo: TipoDoRequerimentoPdf; texto: string; comissao?: string; dispositivo?: string },
): Promise<RequerimentoPdfResultado> {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  if (!podeEmitir({ user, org })) return { ok: false, erro: "O requerimento em PDF é emitido pelo gabinete — você não tem acesso a esta ação." };

  if (typeof demandaId !== "string" || !/^[0-9a-f-]{36}$/i.test(demandaId)) return { ok: false, erro: "Visita não encontrada." };
  const tipo: TipoDoRequerimentoPdf = pedido?.tipo === "audiencia_publica" ? "audiencia_publica" : "visita_tecnica";
  const problema = problemaDoTextoDoRequerimento(pedido?.texto);
  if (problema) return { ok: false, erro: problema };
  const corpo = limparTextoOficial(String(pedido.texto));

  const db = await createClient();
  // Posse: a RLS de `demandas` + filtro explícito de organização.
  const { data: dem, error } = await db
    .from("demandas")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (error) return { ok: false, erro: "Erro ao carregar a visita." };
  if (!dem) return { ok: false, erro: "Visita não encontrada." };
  // Daqui em diante vale o id como o BANCO o escreve (caixa canônica), não o que veio no pedido.
  const idDaVisita = String((dem as { id: string }).id);

  const admin = createAdminClient();
  const ident = await identidadeDoOficio(db, admin, org.orgId);
  const agora = new Date();
  const titulo = tituloDoRequerimento(tipo);

  let buffer: Buffer;
  try {
    buffer = await renderOficioPdf({
      modelo: "requerimento",
      titulo,
      numero: 0,
      ano: agora.getFullYear(),
      corpo,
      orgao: null,
      cidade: ident.cidade,
      dataISO: agora.toISOString(),
      nome: ident.nome,
      subtitulo: ident.subtitulo,
      cargo: ident.cargo,
      assinaturaUrl: ident.assinaturaUrl,
      assinaturaModo: ident.assinaturaModo,
      timbradoUrl: ident.timbradoUrl,
      timbradoMargens: ident.timbradoMargens,
      marca: ident.marca,
    });
  } catch {
    return { ok: false, erro: "Falha ao montar o PDF do requerimento." };
  }

  // Um arquivo por tipo e por visita: gerar de novo substitui o anterior.
  const path = `${org.orgId}/${idDaVisita}/requerimento-${tipo}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, erro: "Erro ao guardar o requerimento." };

  const nome = `Requerimento - ${tipo === "audiencia_publica" ? "audiência pública" : "visita técnica"}.pdf`;
  const { data: existente } = await db
    .from("pol_demanda_anexos")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", idDaVisita)
    .eq("storage_path", path)
    .maybeSingle();
  // O registro do anexo é o que faz o PDF aparecer na visita (e entrar no expurgo da LGPD).
  // Sem evento no histórico de propósito: os eventos alimentam a redação da IA como fatos do caso.
  const gravacao = existente?.id
    ? await admin
        .from("pol_demanda_anexos")
        .update({ nome_arquivo: nome, media_size_bytes: buffer.length })
        .eq("organization_id", org.orgId)
        .eq("id", (existente as { id: string }).id)
    : await admin.from("pol_demanda_anexos").insert({
        organization_id: org.orgId,
        demanda_id: idDaVisita,
        storage_path: path,
        nome_arquivo: nome,
        media_mime: "application/pdf",
        media_size_bytes: buffer.length,
        created_by: user.id,
      });
  if (gravacao.error) return { ok: false, erro: "O PDF foi montado, mas não consegui guardá-lo na visita. Tente de novo." };

  // Lembra a comissão e o artigo para a equipe (só grava quando mudou).
  await lembrarConfig(admin, org.orgId, pedido?.comissao, pedido?.dispositivo);

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return { ok: false, erro: "Requerimento guardado, mas falhou ao abrir o link." };
  return { ok: true, url: signed.signedUrl, nome };
}

async function lembrarConfig(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  comissao: unknown,
  dispositivo: unknown,
): Promise<void> {
  try {
    const curto = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 200) : "");
    const nova: ConfigDoRequerimento = { comissao: curto(comissao), dispositivo: curto(dispositivo) };
    if (!nova.comissao && !nova.dispositivo) return;
    const { data, error } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
    // Leitura que falhou NUNCA vira base de gravação: regravar a partir de vazio apagaria
    // todas as configurações da organização.
    if (error || !data) return;
    const lido = (data as { settings?: unknown }).settings;
    if (lido !== null && lido !== undefined && (typeof lido !== "object" || Array.isArray(lido))) return;
    const settings = (lido ?? {}) as Record<string, unknown>;
    const atual = configDoRequerimentoDeSettings(settings);
    const final: ConfigDoRequerimento = {
      comissao: nova.comissao || atual.comissao,
      dispositivo: nova.dispositivo || atual.dispositivo,
    };
    if (final.comissao === atual.comissao && final.dispositivo === atual.dispositivo) return;
    const gabinete = (
      settings.gabinete && typeof settings.gabinete === "object" && !Array.isArray(settings.gabinete) ? settings.gabinete : {}
    ) as Record<string, unknown>;
    await admin
      .from("organizations")
      .update({ settings: { ...settings, gabinete: { ...gabinete, requerimento: final } } })
      .eq("id", orgId);
  } catch {
    /* lembrar é conveniência: nunca derruba a emissão */
  }
}

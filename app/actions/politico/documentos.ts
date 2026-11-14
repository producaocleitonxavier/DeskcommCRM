"use server";

/**
 * DOCUMENTOS DO GABINETE PARA A CASA (aba "Requerimentos" de Ofícios e Requerimentos).
 *
 * Cada documento é um REGISTRO PRÓPRIO (`pol_documentos`, migration 9099): tipo,
 * assunto, texto, situação, número de protocolo, prazo e PDF no papel timbrado.
 * Pode nascer do zero ou de uma demanda/visita. Nada é enviado a ninguém: o
 * documento é protocolado no sistema da Casa.
 *
 * Quais tipos existem para o gabinete, e com que NOME, é configuração dele
 * (`organizations.settings.gabinete.documentos`) — ver `lib/politico/documentos.ts`.
 *
 * Acesso: a mesma trava de SERVIDOR do ofício (papel de atendente + a porta
 * "Ofícios" no menu da pessoa). Organização sempre da sessão, nunca do pedido.
 */

import { generateText } from "ai";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { buildModel } from "@/lib/ai/runtime/agent";
import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { autenticarComPapel } from "@/lib/politico/acesso";
import { cerebroDaOrg } from "@/lib/politico/cerebro-da-org";
import {
  normalizarTipos,
  prepararDocumento,
  resumoDaMudancaDeTipos,
  tiposDeSettings,
  tituloDoDocumento,
  type FuncaoDoDocumento,
  type SituacaoDoDocumento,
  type TipoDeDocumento,
} from "@/lib/politico/documentos";
import { identidadeDoOficio } from "@/lib/politico/identidade-do-oficio";
import { renderOficioPdf } from "@/lib/politico/oficio-pdf";
import {
  dataDaPraxe,
  instrucoesDoDocumentoDaCasa,
  limparTextoOficial,
  montarPedidoDoDocumentoDaCasa,
} from "@/lib/politico/redacao-oficial";
import { problemaDoTextoDoRequerimento } from "@/lib/politico/requerimento-pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

const BUCKET = "gabinete-anexos";
const COLUNAS =
  "id, funcao, rotulo, subtipo, assunto, destinatario, dispositivo, corpo, numero, situacao, protocolado_em, prazo_em, demanda_id, pdf_path, created_at, updated_at";

export type DocumentoItem = {
  id: string;
  funcao: FuncaoDoDocumento;
  rotulo: string;
  subtipo: string | null;
  assunto: string;
  destinatario: string | null;
  dispositivo: string | null;
  corpo: string;
  numero: string | null;
  situacao: SituacaoDoDocumento;
  protocolado_em: string | null;
  prazo_em: string | null;
  demanda_id: string | null;
  temPdf: boolean;
  created_at: string;
  updated_at: string;
};

type Falha = { ok: false; erro: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEM_ACESSO = "Estes documentos são do gabinete — você não tem acesso a esta ação.";
/** Redações com IA por pessoa, por hora. */
const REDACOES_POR_HORA = 40;
const SEM_TABELA = "Esta tela ainda não foi ativada no banco de dados desta instalação.";

/** Sessão + organização + a trava do ofício. `null` quando a pessoa não pode. */
async function sessaoDoGabinete() {
  const user = await autenticarComPapel("agent");
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const ehPlataforma = !!user.is_platform_admin && !user.support;
  const ehGestor = ehPlataforma || ROLE_RANK[org.role] >= ROLE_RANK.manager;
  // Abaixo de gestor, vale a porta "Ofícios" no menu da pessoa (separa rua de gabinete). Gestor
  // para cima não passa por ela — a mesma régua de `exigirAcessoPolitico`, para um menu
  // personalizado antigo não deixar o gestor abrir a tela e ter toda ação recusada.
  const pode =
    ehGestor ||
    destinosDaInterface(org.interface_settings, ehPlataforma, org.role).some((d) => d.href === "/app/politico/oficios");
  if (!pode) return null;
  return { user, org, ehGestor };
}

function paraItem(l: Record<string, unknown>): DocumentoItem {
  return {
    id: String(l.id),
    funcao: l.funcao as FuncaoDoDocumento,
    rotulo: String(l.rotulo ?? ""),
    subtipo: (l.subtipo as string | null) ?? null,
    assunto: String(l.assunto ?? ""),
    destinatario: (l.destinatario as string | null) ?? null,
    dispositivo: (l.dispositivo as string | null) ?? null,
    corpo: String(l.corpo ?? ""),
    numero: (l.numero as string | null) ?? null,
    situacao: l.situacao as SituacaoDoDocumento,
    protocolado_em: (l.protocolado_em as string | null) ?? null,
    prazo_em: (l.prazo_em as string | null) ?? null,
    demanda_id: (l.demanda_id as string | null) ?? null,
    temPdf: typeof l.pdf_path === "string" && l.pdf_path.length > 0,
    created_at: String(l.created_at ?? ""),
    updated_at: String(l.updated_at ?? ""),
  };
}

/** A tabela ainda não existe nesta instalação? (o SQL da 9099 não foi rodado) */
function faltaATabela(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === "42P01" || erro.code === "PGRST205";
}

export type PainelDeDocumentos = {
  ok: true;
  itens: DocumentoItem[];
  tipos: TipoDeDocumento[];
  /** Gestor para cima escolhe os tipos e os nomes. */
  podeConfigurar: boolean;
  /** Comissão e artigo usados da última vez (lembrança do gabinete). */
  lembrado: { destinatario: string; dispositivo: string };
  /** O banco desta instalação ainda não tem a tabela. */
  semTabela: boolean;
  /** O padrão do gabinete: o PDF sai com a linha e o nome para assinar? */
  assinaturaPadrao: boolean;
};

export async function carregarDocumentos(): Promise<PainelDeDocumentos | Falha> {
  const s = await sessaoDoGabinete();
  if (!s) return { ok: false, erro: SEM_ACESSO };
  const db = await createClient();
  const [{ data: orgRow }, lista, { data: cfg }] = await Promise.all([
    db.from("organizations").select("settings").eq("id", s.org.orgId).maybeSingle(),
    db.from("pol_documentos").select(COLUNAS).eq("organization_id", s.org.orgId).order("updated_at", { ascending: false }).limit(300),
    db.from("pol_gabinete_config").select("oficio_assinatura_modo").eq("organization_id", s.org.orgId).maybeSingle(),
  ]);
  const settings = (orgRow as { settings?: unknown } | null)?.settings;
  const req = ((settings as Record<string, unknown> | undefined)?.gabinete as Record<string, unknown> | undefined)?.requerimento as
    | Record<string, unknown>
    | undefined;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 300) : "");
  return {
    ok: true,
    itens: ((lista.data ?? []) as Record<string, unknown>[]).map(paraItem),
    tipos: tiposDeSettings(settings),
    podeConfigurar: s.ehGestor,
    lembrado: { destinatario: texto(req?.comissao), dispositivo: texto(req?.dispositivo) },
    semTabela: faltaATabela(lista.error),
    assinaturaPadrao: (cfg as { oficio_assinatura_modo?: string | null } | null)?.oficio_assinatura_modo !== "gov_br",
  };
}

/** Cria (id nulo) ou atualiza um documento. `demandaId` só vale na criação. */
export async function salvarDocumento(
  id: string | null,
  dados: unknown,
  demandaId?: string | null,
): Promise<{ ok: true; item: DocumentoItem } | Falha> {
  const s = await sessaoDoGabinete();
  if (!s) return { ok: false, erro: SEM_ACESSO };
  if (supportWriteError(s.user.support)) return { ok: false, erro: "A conta de suporte só consulta; não grava." };
  if (id !== null && !UUID.test(String(id))) return { ok: false, erro: "Documento não encontrado." };

  const db = await createClient();
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", s.org.orgId).maybeSingle();
  const tipos = tiposDeSettings((orgRow as { settings?: unknown } | null)?.settings);

  // Na EDIÇÃO o tipo é o que o documento já tem (mesmo que tenha sido desligado depois).
  let entrada = dados;
  let tiposParaConferir: readonly TipoDeDocumento[] = tipos;
  let situacaoAtual: SituacaoDoDocumento | undefined;
  if (id !== null) {
    const { data: atual } = await db.from("pol_documentos").select("funcao, rotulo, situacao").eq("organization_id", s.org.orgId).eq("id", id).maybeSingle();
    if (!atual) return { ok: false, erro: "Documento não encontrado." };
    const a = atual as { funcao: FuncaoDoDocumento; rotulo: string; situacao: SituacaoDoDocumento };
    situacaoAtual = a.situacao;
    entrada = { ...(dados as Record<string, unknown>), funcao: a.funcao };
    tiposParaConferir = [{ funcao: a.funcao, rotulo: a.rotulo, ligado: true }];
  }
  const pronto = prepararDocumento(entrada, tiposParaConferir, situacaoAtual);
  if (!pronto.ok) return pronto;

  if (id === null) {
    let demanda: string | null = null;
    if (demandaId) {
      if (!UUID.test(String(demandaId))) return { ok: false, erro: "Demanda não encontrada." };
      // Posse da demanda: RLS + filtro explícito de organização.
      const { data: d } = await db.from("demandas").select("id").eq("organization_id", s.org.orgId).eq("id", demandaId).maybeSingle();
      if (!d) return { ok: false, erro: "Demanda não encontrada." };
      demanda = String((d as { id: string }).id);
    }
    const { data, error } = await db
      .from("pol_documentos")
      .insert({ ...pronto.doc, organization_id: s.org.orgId, demanda_id: demanda, created_by: s.user.id })
      .select(COLUNAS)
      .single();
    if (error || !data) return { ok: false, erro: faltaATabela(error) ? SEM_TABELA : "Não consegui salvar o documento." };
    if (pronto.doc.funcao === "pedido_comissao") await lembrarComissao(s.org.orgId, pronto.doc.destinatario, pronto.doc.dispositivo);
    await audit({
      action: "pol_documentos.create",
      actorUserId: s.user.id,
      organizationId: s.org.orgId,
      resourceType: "pol_documentos",
      resourceId: (data as { id: string }).id,
      metadata: { funcao: pronto.doc.funcao, rotulo: pronto.doc.rotulo, de_demanda: demanda !== null },
    });
    return { ok: true, item: paraItem(data as Record<string, unknown>) };
  }

  // O PDF guardado NÃO é apagado aqui: "Baixar PDF" sempre monta de novo a partir do texto salvo,
  // no mesmo caminho — e manter o vínculo garante o expurgo do arquivo se o documento for apagado.
  const { data, error } = await db
    .from("pol_documentos")
    .update({ ...pronto.doc, updated_at: new Date().toISOString() })
    .eq("organization_id", s.org.orgId)
    .eq("id", id)
    .select(COLUNAS)
    .single();
  if (error || !data) return { ok: false, erro: "Não consegui salvar o documento." };
  await audit({
    action: "pol_documentos.update",
    actorUserId: s.user.id,
    organizationId: s.org.orgId,
    resourceType: "pol_documentos",
    resourceId: id,
    metadata: { situacao_antes: situacaoAtual ?? null, situacao: pronto.doc.situacao, numero: pronto.doc.numero },
  });
  return { ok: true, item: paraItem(data as Record<string, unknown>) };
}

/** Guarda a comissão e o artigo como lembrança do gabinete. Conveniência: nunca derruba o salvar. */
async function lembrarComissao(orgId: string, comissao: string | null, dispositivo: string | null): Promise<void> {
  try {
    if (!comissao && !dispositivo) return;
    const admin = createAdminClient();
    const { data, error } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
    // Leitura que falhou NUNCA vira base de gravação (regravar a partir de vazio apagaria tudo).
    if (error || !data) return;
    const lido = (data as { settings?: unknown }).settings;
    if (lido !== null && lido !== undefined && (typeof lido !== "object" || Array.isArray(lido))) return;
    const settings = (lido ?? {}) as Record<string, unknown>;
    const gabinete = (settings.gabinete && typeof settings.gabinete === "object" && !Array.isArray(settings.gabinete) ? settings.gabinete : {}) as Record<string, unknown>;
    const atual = (gabinete.requerimento && typeof gabinete.requerimento === "object" ? gabinete.requerimento : {}) as Record<string, unknown>;
    const novo = {
      comissao: (comissao ?? "").slice(0, 200) || (typeof atual.comissao === "string" ? atual.comissao : ""),
      dispositivo: (dispositivo ?? "").slice(0, 200) || (typeof atual.dispositivo === "string" ? atual.dispositivo : ""),
    };
    if (novo.comissao === atual.comissao && novo.dispositivo === atual.dispositivo) return;
    await admin.from("organizations").update({ settings: { ...settings, gabinete: { ...gabinete, requerimento: novo } } }).eq("id", orgId);
  } catch {
    /* lembrar é conveniência */
  }
}

export async function excluirDocumento(id: string): Promise<{ ok: true } | Falha> {
  const s = await sessaoDoGabinete();
  if (!s) return { ok: false, erro: SEM_ACESSO };
  if (supportWriteError(s.user.support)) return { ok: false, erro: "A conta de suporte só consulta; não grava." };
  if (!UUID.test(String(id))) return { ok: false, erro: "Documento não encontrado." };
  const db = await createClient();
  // Só rascunho se apaga: documento já protocolado é registro do mandato (arquive).
  const { data: atual } = await db.from("pol_documentos").select("situacao, numero, protocolado_em").eq("organization_id", s.org.orgId).eq("id", id).maybeSingle();
  if (!atual) return { ok: false, erro: "Documento não encontrado." };
  const a = atual as { situacao: string; numero: string | null; protocolado_em: string | null };
  if (a.situacao !== "rascunho" || a.numero || a.protocolado_em) {
    return { ok: false, erro: "Só rascunho pode ser apagado. Documento já protocolado deve ser arquivado." };
  }
  const { error } = await db.from("pol_documentos").delete().eq("organization_id", s.org.orgId).eq("id", id).eq("situacao", "rascunho");
  if (error) return { ok: false, erro: "Não consegui apagar o documento." };
  await audit({
    action: "pol_documentos.delete",
    actorUserId: s.user.id,
    organizationId: s.org.orgId,
    resourceType: "pol_documentos",
    resourceId: id,
  });
  return { ok: true };
}

export type PontoDePartida = { demandaId: string; assunto: string; destinatarioSugerido: string | null };

/** Os dados de uma demanda/visita para um documento nascer dela (assunto e órgão). */
export async function pontoDePartidaDaDemanda(demandaId: string): Promise<{ ok: true; partida: PontoDePartida } | Falha> {
  const s = await sessaoDoGabinete();
  if (!s) return { ok: false, erro: SEM_ACESSO };
  if (!UUID.test(String(demandaId))) return { ok: false, erro: "Demanda não encontrada." };
  const db = await createClient();
  const { data } = await db.from("demandas").select("id, assunto, pol_orgao_destino").eq("organization_id", s.org.orgId).eq("id", demandaId).maybeSingle();
  if (!data) return { ok: false, erro: "Demanda não encontrada." };
  const d = data as { id: string; assunto: string | null; pol_orgao_destino: string | null };
  return { ok: true, partida: { demandaId: d.id, assunto: (d.assunto ?? "").trim().slice(0, 300), destinatarioSugerido: d.pol_orgao_destino?.trim() || null } };
}

/**
 * Redige o texto com a IA da organização. Só devolve o texto, para a equipe revisar:
 * não grava nada. Com `demandaId`, usa o local, a data e os relatos da demanda como fatos.
 */
export async function redigirDocumento(pedido: {
  funcao: FuncaoDoDocumento;
  subtipo?: string | null;
  assunto: string;
  destinatario?: string | null;
  dispositivo?: string | null;
  orientacao?: string | null;
  demandaId?: string | null;
}): Promise<{ ok: true; texto: string } | Falha> {
  const s = await sessaoDoGabinete();
  if (!s) return { ok: false, erro: SEM_ACESSO };
  if (supportWriteError(s.user.support)) return { ok: false, erro: "A conta de suporte só consulta; não redige." };
  // Folgado de propósito: quem redige costuma refazer algumas vezes. Só segura o descontrole
  // (clique preso, automação), que gastaria a IA do gabinete sem ninguém ver.
  const uso = await checkRateLimit(`pol-doc-redigir:${s.org.orgId}:${s.user.id}`, REDACOES_POR_HORA, 3600);
  if (!uso.allowed) {
    return { ok: false, erro: `Você já pediu ${REDACOES_POR_HORA} redações na última hora. Espere um pouco ou edite o texto à mão.` };
  }
  const curto = (v: unknown, teto: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, teto) : "");

  const db = await createClient();
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", s.org.orgId).maybeSingle();
  const tipo = tiposDeSettings((orgRow as { settings?: unknown } | null)?.settings).find((t) => t.funcao === pedido?.funcao);
  if (!tipo) return { ok: false, erro: "Escolha o tipo do documento." };
  const assunto = curto(pedido.assunto, 300);
  if (!assunto) return { ok: false, erro: "Escreva o assunto antes de redigir." };

  // Fatos da demanda (quando o documento nasce de uma): RLS + filtro explícito de organização.
  let local: string | null = null;
  let quando: string | null = null;
  let cidade: string | null = null;
  let relatos: string[] = [];
  if (pedido.demandaId) {
    if (!UUID.test(String(pedido.demandaId))) return { ok: false, erro: "Demanda não encontrada." };
    const { data: d } = await db
      .from("demandas")
      .select("id, pol_municipio, prazo_em, pol_visita_relato, pol_local_ocorrencia")
      .eq("organization_id", s.org.orgId)
      .eq("id", pedido.demandaId)
      .maybeSingle();
    if (!d) return { ok: false, erro: "Demanda não encontrada." };
    const dem = d as { id: string; pol_municipio: string | null; prazo_em: string | null; pol_visita_relato: string | null; pol_local_ocorrencia: string | null };
    local = dem.pol_local_ocorrencia?.trim() || null;
    cidade = dem.pol_municipio?.trim() || null;
    const prazo = dem.prazo_em ? new Date(dem.prazo_em) : null;
    quando = prazo && !Number.isNaN(prazo.getTime()) ? dataDaPraxe(prazo) : null;
    const { data: eventos } = await db
      .from("pol_demanda_eventos")
      .select("tipo, descricao, created_at")
      .eq("organization_id", s.org.orgId)
      .eq("demanda_id", dem.id)
      .order("created_at", { ascending: true })
      .limit(40);
    const SO_ANDAMENTO = new Set(["cidadao_avisado", "oficio_emitido", "estado_alterado"]);
    relatos = [
      ...((eventos ?? []) as { tipo: string | null; descricao: string | null }[])
        .filter((e) => !SO_ANDAMENTO.has(String(e.tipo ?? "")))
        .map((e) => e.descricao ?? ""),
      dem.pol_visita_relato ?? "",
    ].filter((r) => r.trim().length > 0);
  }
  if (!cidade) {
    const { data: cfg } = await db.from("pol_gabinete_config").select("cidade").eq("organization_id", s.org.orgId).maybeSingle();
    cidade = (cfg as { cidade?: string | null } | null)?.cidade?.trim() || null;
  }

  const admin = createAdminClient();
  const cerebro = await cerebroDaOrg(admin, s.org.orgId);
  if ("erro" in cerebro) return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };

  try {
    const { text } = await generateText({
      model: buildModel(cerebro.provider, cerebro.apiKey, cerebro.model),
      system: instrucoesDoDocumentoDaCasa(tipo.funcao, curto(pedido.subtipo, 60) || null),
      prompt: montarPedidoDoDocumentoDaCasa({
        funcao: tipo.funcao,
        rotulo: tipo.rotulo,
        subtipo: curto(pedido.subtipo, 60) || null,
        assunto,
        destinatario: curto(pedido.destinatario, 300) || null,
        dispositivo: curto(pedido.dispositivo, 200) || null,
        orientacao: curto(pedido.orientacao, 1500) || null,
        local,
        quando,
        cidade,
        relatos,
      }),
      maxOutputTokens: 1200,
    });
    const texto = limparTextoOficial(text);
    if (!texto) return { ok: false, erro: "A IA não retornou texto. Tente novamente." };
    return { ok: true, texto };
  } catch {
    return { ok: false, erro: "Não consegui redigir agora. Tente novamente em instantes." };
  }
}

/** Gera o PDF do documento SALVO, no papel timbrado, e guarda o arquivo no registro. */
export async function baixarPdfDoDocumento(
  id: string,
  /** Desenhar a linha e o nome para assinar no fim do texto? Ausente = o padrão do gabinete (Identidade do Mandato). */
  incluirAssinatura?: boolean,
): Promise<{ ok: true; url: string } | Falha> {
  const s = await sessaoDoGabinete();
  if (!s) return { ok: false, erro: SEM_ACESSO };
  if (supportWriteError(s.user.support)) return { ok: false, erro: "A conta de suporte só consulta; não grava." };
  if (!UUID.test(String(id))) return { ok: false, erro: "Documento não encontrado." };
  const db = await createClient();
  const { data } = await db.from("pol_documentos").select(COLUNAS).eq("organization_id", s.org.orgId).eq("id", id).maybeSingle();
  if (!data) return { ok: false, erro: "Documento não encontrado." };
  const doc = paraItem(data as Record<string, unknown>);
  const problema = problemaDoTextoDoRequerimento(doc.corpo);
  if (problema) return { ok: false, erro: problema };

  const admin = createAdminClient();
  const ident = await identidadeDoOficio(db, admin, s.org.orgId);
  const comAssinatura = typeof incluirAssinatura === "boolean" ? incluirAssinatura : ident.assinaturaModo !== "gov_br";
  const agora = new Date();
  let buffer: Buffer;
  try {
    buffer = await renderOficioPdf({
      modelo: "requerimento",
      titulo: tituloDoDocumento(doc.rotulo, doc.subtipo),
      numero: 0,
      ano: agora.getFullYear(),
      corpo: limparTextoOficial(doc.corpo),
      orgao: null,
      cidade: ident.cidade,
      dataISO: agora.toISOString(),
      nome: ident.nome,
      subtitulo: ident.subtitulo,
      cargo: ident.cargo,
      assinaturaUrl: ident.assinaturaUrl,
      assinaturaModo: comAssinatura ? "imagem" : "gov_br",
      assinaturaLinhas: ident.assinaturaLinhas,
      timbradoUrl: ident.timbradoUrl,
      timbradoMargens: ident.timbradoMargens,
      marca: ident.marca,
    });
  } catch {
    return { ok: false, erro: "Falha ao montar o PDF." };
  }

  // Um arquivo por documento (o id vem do BANCO): gerar de novo substitui o anterior.
  const path = `${s.org.orgId}/documentos/${doc.id}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (up.error) return { ok: false, erro: "Erro ao guardar o PDF." };
  const { error: errPath } = await db.from("pol_documentos").update({ pdf_path: path }).eq("organization_id", s.org.orgId).eq("id", doc.id);
  if (errPath) return { ok: false, erro: "O PDF foi montado, mas não consegui guardá-lo no documento. Tente de novo." };

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return { ok: false, erro: "PDF guardado, mas falhou ao abrir o link." };
  return { ok: true, url: signed.signedUrl };
}

/** Quais tipos de documento este gabinete usa, e com que nome. Gestor para cima. */
export async function salvarTiposDeDocumento(entrada: unknown): Promise<{ ok: true; tipos: TipoDeDocumento[] } | Falha> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  if (supportWriteError(user.support)) return { ok: false, erro: "A conta de suporte só consulta; não grava." };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Organização inválida." };
  const ehPlataforma = !!user.is_platform_admin && !user.support;
  if (!ehPlataforma && ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, erro: "Só o gestor do gabinete muda os tipos de documento." };
  if (await mfaEmDivida()) return { ok: false, erro: "Confirme a verificação em duas etapas para mudar configurações." };
  if (!Array.isArray(entrada)) return { ok: false, erro: "Dados inválidos." };
  const tipos = normalizarTipos(entrada);
  if (!tipos.some((t) => t.ligado)) return { ok: false, erro: "Deixe pelo menos um tipo de documento ligado." };

  const admin = createAdminClient();
  const { data, error } = await admin.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  // Leitura que falhou NUNCA vira base de gravação (regravar a partir de vazio apagaria tudo).
  if (error || !data) return { ok: false, erro: "Não consegui ler as configurações. Tente de novo." };
  const lido = (data as { settings?: unknown }).settings;
  if (lido !== null && lido !== undefined && (typeof lido !== "object" || Array.isArray(lido))) {
    return { ok: false, erro: "As configurações estão num formato inesperado. Avise o suporte." };
  }
  const settings = (lido ?? {}) as Record<string, unknown>;
  const gabinete = (settings.gabinete && typeof settings.gabinete === "object" && !Array.isArray(settings.gabinete) ? settings.gabinete : {}) as Record<string, unknown>;
  const { error: errGravar } = await admin
    .from("organizations")
    .update({ settings: { ...settings, gabinete: { ...gabinete, documentos: { tipos } } } })
    .eq("id", org.orgId);
  if (errGravar) return { ok: false, erro: "Não consegui salvar. Tente de novo." };
  const antes = tiposDeSettings(settings);
  if (resumoDaMudancaDeTipos(antes, tipos).length > 0) {
    await audit({
      action: "pol_gabinete.documentos_tipos_updated",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "organization",
      resourceId: org.orgId,
      metadata: { antes, depois: tipos },
    });
  }
  return { ok: true, tipos };
}

export type MudancaDeTipos = { quando: string; quem: string; oQue: string[] };

/** As últimas mudanças nos tipos de documento do gabinete: quem, quando e o quê. Gestor para cima. */
export async function historicoDosTiposDeDocumento(): Promise<{ ok: true; mudancas: MudancaDeTipos[] } | Falha> {
  const s = await sessaoDoGabinete();
  if (!s || !s.ehGestor) return { ok: false, erro: "Só o gestor do gabinete vê este histórico." };
  const admin = createAdminClient();
  // Auditoria é lida com a chave de serviço (a regra do banco só mostra ao administrador);
  // o filtro de organização vem da sessão.
  const { data, error } = await admin
    .from("api_audit_log")
    .select("actor_user_id, metadata, created_at")
    .eq("organization_id", s.org.orgId)
    .eq("action", "pol_gabinete.documentos_tipos_updated")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return { ok: false, erro: "Não consegui ler o histórico." };
  const linhas = (data ?? []) as { actor_user_id: string | null; metadata: Record<string, unknown> | null; created_at: string }[];
  const nomes = await nomesDosAtendentes([...new Set(linhas.map((l) => l.actor_user_id).filter((v): v is string => !!v))]);
  return {
    ok: true,
    mudancas: linhas
      .map((l) => ({
        quando: l.created_at,
        quem: (l.actor_user_id && nomes.get(l.actor_user_id)) || "Alguém da equipe",
        oQue: resumoDaMudancaDeTipos(l.metadata?.antes, l.metadata?.depois),
      }))
      .filter((m) => m.oQue.length > 0),
  };
}

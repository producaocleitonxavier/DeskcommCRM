"use server";

/**
 * Server actions do Gabinete. OBRIGATÓRIO: o Supabase client do BROWSER não vê
 * a sessão (cookie httpOnly) → queries do browser saem como anônimo e a RLS
 * devolve vazio. Toda leitura/escrita de dados do gabinete passa por aqui, no
 * servidor, com o client autenticado (RLS libera a organização ativa).
 *
 * `organization_id` vem SEMPRE de resolveActiveOrg (nunca do input).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg, orgSeAoMenos } from "@/lib/auth/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export type AcaoResultado = { ok: true; id?: string } | { ok: false; erro: string };
export interface CidadaoOpcao {
  id: string;
  name: string | null;
  phone_number: string | null;
}
export interface AnexoDemanda {
  id: string;
  nome_arquivo: string;
  media_mime: string;
  media_size_bytes: number;
  created_at: string;
  /** URL assinada temporaria (1h) para baixar; null se o Storage recusou. */
  url: string | null;
}

const BUCKET_ANEXOS = "gabinete-anexos";

// Tabelas do gabinete que as actions podem gravar (whitelist).
const TABELAS = new Set(["demandas", "pol_liderancas", "pol_emendas", "pol_projetos_lei", "pol_agenda", "pol_obras", "pol_materiais", "pol_locais"]);

async function orgAtiva(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  return org?.orgId ?? null;
}


function traduzErro(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um registro com esse identificador.";
  if (error.code === "23514") return "Algum valor está fora do permitido para este campo.";
  // 57014 = statement timeout. A operação é segura (nada é alterado quando ela
  // é cancelada), então nunca mostramos o texto cru do Postgres ao usuário.
  if (error.code === "57014" || /statement timeout/i.test(error.message))
    return "A base é grande e a operação passou do tempo limite — nada foi alterado. Tente de novo; se continuar, avise a equipe técnica.";
  return "Não foi possível concluir agora. Tente de novo; se continuar, avise a equipe técnica.";
}

function normalizarTelefone(tel: string): string | null {
  const d = tel.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return "+" + d;
  if (d.length === 10 || d.length === 11) return "+55" + d;
  return "+" + d;
}

/** Busca cidadãos (contacts) por nome, na org ativa. Server-side (autenticado). */
export async function buscarCidadaos(q: string): Promise<CidadaoOpcao[]> {
  const termo = q.trim();
  if (termo.length < 2) return [];
  const org = await orgAtiva();
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("contacts")
    .select("id, name, phone_number")
    .eq("organization_id", org)
    .ilike("name", `%${termo}%`)
    .order("name")
    .limit(8);
  return (data ?? []) as CidadaoOpcao[];
}

/** Cria um cidadão (contact) mínimo na org ativa e devolve o id. */
export async function criarCidadao(
  nome: string,
  telefone?: string,
  endereco?: string,
  nascimento?: string,
  bairro?: string,
  cidade?: string,
): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (!nome.trim()) return { ok: false, erro: "Informe o nome do cidadão." };
  const db = await createClient();
  const payload: Record<string, unknown> = { organization_id: org, name: nome.trim(), source: "gabinete" };
  const fone = telefone ? normalizarTelefone(telefone) : null;
  if (fone) payload.phone_number = fone;
  // Endereço vai no mesmo lugar que o resto do político usa (custom_fields.endereco_gip),
  // para alimentar a inteligência territorial.
  const geo: Record<string, string> = {};
  if (endereco?.trim()) geo.endereco = endereco.trim();
  if (bairro?.trim()) geo.bairro = bairro.trim();
  if (cidade?.trim()) geo.cidade = cidade.trim();
  if (Object.keys(geo).length > 0) payload.custom_fields = { endereco_gip: geo };
  // Data de nascimento: coluna `birthdate` (YYYY-MM-DD, vinda do input date).
  // Só grava se vier no formato certo — nunca manda string vazia (quebra o tipo date).
  if (nascimento && /^\d{4}-\d{2}-\d{2}$/.test(nascimento.trim())) payload.birthdate = nascimento.trim();
  const { data, error } = await db.from("contacts").insert(payload).select("id").maybeSingle();
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, id: (data?.id as string | undefined) };
}

/**
 * Garante que um cidadão esteja na BASE (funil político) como `novo_cadastro`.
 * Idempotente: quem já é lead (qualquer nível) não é tocado. É o que faz o
 * solicitante de uma demanda "entrar no nosso cadastro" — pronto para nutrir.
 */
export async function garantirLeadNovoCadastro(contactId: string): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { data: existe } = await db
    .from("pol_leads")
    .select("id")
    .eq("organization_id", org)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (existe) return { ok: true, id: existe.id as string };
  const { data, error } = await db
    .from("pol_leads")
    .insert({ organization_id: org, contact_id: contactId, support_level: "novo_cadastro", consent_origin: "gabinete" })
    .select("id")
    .maybeSingle();
  if (error && error.code !== "23505") return { ok: false, erro: traduzErro(error) };
  return { ok: true, id: (data?.id as string | undefined) };
}

/**
 * Carimba a ZONA ELEITORAL provável nas pessoas da base, derivada do BAIRRO
 * (dados do TSE via intel_zona_do_bairro). Rodar depois de importar a base.
 * Eficiente (uma derivação por bairro distinto) e idempotente (só preenche o
 * que está vazio). Devolve quantas pessoas foram carimbadas.
 */
export async function carimbarZonasDosLeads(): Promise<{ ok: true; carimbados: number } | { ok: false; erro: string }> {
  const org = await orgSeAoMenos("manager");
  if (!org) return { ok: false, erro: "Sem permissão para esta ação (requer Gerente ou Administrador)." };
  const db = await createClient();
  const { data, error } = await db.rpc("pol_carimbar_zonas_leads", { p_org: org });
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, carimbados: typeof data === "number" ? data : 0 };
}

/**
 * Religa a CIDADE (pol_leads.territory_id) à cidade do contato (custom_fields).
 * Necessário depois de importar/re-importar a base, que traz a cidade em
 * custom_fields mas não preenche o territory_id — sem isso o filtro de Cidade e
 * o mapa de calor ficam zerados. Idempotente (só onde territory_id é nulo).
 */
export async function carimbarCidadesDosLeads(): Promise<{ ok: true; carimbados: number } | { ok: false; erro: string }> {
  const org = await orgSeAoMenos("manager");
  if (!org) return { ok: false, erro: "Sem permissão para esta ação (requer Gerente ou Administrador)." };
  const db = await createClient();
  const { data, error } = await db.rpc("pol_carimbar_cidade_leads", { p_org: org });
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, carimbados: typeof data === "number" ? data : 0 };
}

/** Insere um registro numa tabela do gabinete, escopado à org ativa. */
export async function criarRegistro(tabela: string, dados: Record<string, unknown>): Promise<AcaoResultado> {
  if (!TABELAS.has(tabela)) return { ok: false, erro: "Tabela inválida." };
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { data, error } = await db
    .from(tabela)
    .insert({ ...dados, organization_id: org })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, id: (data?.id as string | undefined) };
}

/** Atualiza um registro de uma tabela do gabinete (escopado à org ativa). */
export async function atualizarRegistro(tabela: string, id: string, patch: Record<string, unknown>): Promise<AcaoResultado> {
  if (!TABELAS.has(tabela)) return { ok: false, erro: "Tabela inválida." };
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from(tabela).update(patch).eq("id", id).eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

/**
 * Espelha a VISITA TÉCNICA de uma demanda na Agenda do gabinete (pol_agenda,
 * tipo='visita'), ligada por demanda_id — UPSERT, nunca duplica. A data vem de
 * `demandas.prazo_em`; sem data, cancela o compromisso ligado (não apaga). Se a
 * visita foi realizada (pol_visita_realizada_em), o compromisso vira 'concluido'.
 *
 * Idempotente e fail-soft: numa instalação sem a migration 9085 (coluna
 * demanda_id / pol_visita_realizada_em) não quebra o fluxo da demanda — a visita
 * só não aparece na Agenda. Chamada em "fire-and-forget" pelos fluxos de salvar.
 */
export async function sincronizarVisitaNaAgenda(demandaId: string): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data: dem, error: eDem } = await db
    .from("demandas")
    .select("assunto, prazo_em, pol_bairro, pol_municipio, pol_visita_realizada_em, pol_visita_responsavel_id")
    .eq("id", demandaId)
    .eq("organization_id", org)
    .maybeSingle();
  if (eDem) return { ok: true }; // fail-soft: coluna nova ausente — não quebra o salvar
  if (!dem) return { ok: false, erro: "Demanda não encontrada." };
  const d = dem as {
    assunto: string | null;
    prazo_em: string | null;
    pol_bairro: string | null;
    pol_municipio: string | null;
    pol_visita_realizada_em: string | null;
    pol_visita_responsavel_id: string | null;
  };

  // Compromisso de visita já ligado a esta demanda?
  const { data: existente, error: eEx } = await db
    .from("pol_agenda")
    .select("id")
    .eq("organization_id", org)
    .eq("demanda_id", demandaId)
    .eq("tipo", "visita")
    .limit(1)
    .maybeSingle();
  if (eEx) return { ok: true }; // fail-soft: coluna demanda_id ausente
  const agendaId = (existente as { id: string } | null)?.id ?? null;

  // Sem data de visita → cancela o que estava marcado (preserva histórico).
  if (!d.prazo_em) {
    if (agendaId) {
      await db.from("pol_agenda").update({ status: "cancelado" }).eq("id", agendaId).eq("organization_id", org);
    }
    return { ok: true };
  }

  const campos = {
    titulo: `Visita técnica — ${(d.assunto ?? "").trim() || "demanda"}`,
    tipo: "visita",
    data_inicio: d.prazo_em,
    dia_inteiro: true,
    status: d.pol_visita_realizada_em ? "concluido" : "agendado",
    local: (d.pol_bairro ?? "").trim() || null,
    municipio: (d.pol_municipio ?? "").trim() || null,
    descricao: "Visita de uma demanda do gabinete. Abra a demanda para o contexto.",
    demanda_id: demandaId,
    assessor_id: d.pol_visita_responsavel_id, // quem vai na visita aparece como dono do compromisso
  };

  const { error: eWrite } = agendaId
    ? await db.from("pol_agenda").update(campos).eq("id", agendaId).eq("organization_id", org)
    : await db.from("pol_agenda").insert({ ...campos, organization_id: org });
  if (eWrite) return { ok: false, erro: traduzErro(eWrite) };
  return { ok: true };
}

/**
 * Define QUEM vai na visita técnica — um assessor CADASTRADO da org (sempre um só,
 * campo vazio = ninguém marcou). Valida que o assessor é membro ativo da org,
 * resolve o nome de exibição, grava id+nome e reespelha na Agenda (assessor_id).
 * `assessorId = null` tira o responsável. Org-scoped. Registra no histórico.
 */
export async function definirResponsavelVisita(demandaId: string, assessorId: string | null): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  // Tirar o responsável (campo vazio).
  if (!assessorId) {
    const { error } = await db
      .from("demandas")
      .update({ pol_visita_responsavel_id: null, pol_visita_responsavel_nome: null })
      .eq("id", demandaId)
      .eq("organization_id", org);
    if (error) return { ok: false, erro: traduzErro(error) };
    await sincronizarVisitaNaAgenda(demandaId);
    void registrarEventoDemanda(demandaId, "nota", "Responsável pela visita removido.");
    return { ok: true };
  }

  // Só um MEMBRO ATIVO da org pode ser marcado (o id nunca vem de fora da org).
  const { data: membro, error: eMem } = await db
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", org)
    .eq("user_id", assessorId)
    .is("revoked_at", null)
    .maybeSingle();
  if (eMem) return { ok: false, erro: traduzErro(eMem) };
  if (!membro) return { ok: false, erro: "Assessor não encontrado nesta organização." };

  const nomes = await nomesDosAtendentes([assessorId]);
  const nome = nomes.get(assessorId) ?? null;

  const { error } = await db
    .from("demandas")
    .update({ pol_visita_responsavel_id: assessorId, pol_visita_responsavel_nome: nome })
    .eq("id", demandaId)
    .eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  await sincronizarVisitaNaAgenda(demandaId);
  void registrarEventoDemanda(demandaId, "nota", `${nome ?? "Assessor"} vai na visita técnica.`);
  return { ok: true };
}

/**
 * Marca/desmarca a VISITA técnica como realizada (grava pol_visita_realizada_em)
 * e reespelha o estado na Agenda. Ação fina reutilizada pelo módulo "Visitas
 * Técnicas" (a mesma gravação que o card do detalhe faz). Org-scoped.
 */
export async function marcarVisitaRealizada(demandaId: string, realizada: boolean): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db
    .from("demandas")
    .update({ pol_visita_realizada_em: realizada ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", demandaId)
    .eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  await sincronizarVisitaNaAgenda(demandaId);
  void registrarEventoDemanda(demandaId, "nota", realizada ? "Visita técnica realizada." : "Visita técnica marcada como não realizada.");
  return { ok: true };
}

/**
 * RELATO da visita (o que foi feito / presentes / decidido) — o assessor registra
 * o resultado de campo e o gabinete inteiro vê. Marca a visita como realizada se
 * ainda não estiver (relato e realização andam juntos). Reeditável. Org-scoped.
 */
export async function registrarRelatoVisita(
  demandaId: string,
  entrada: { relato?: string; presentes?: string; decisoes?: string },
): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data: atual } = await db
    .from("demandas")
    .select("pol_visita_realizada_em")
    .eq("id", demandaId)
    .eq("organization_id", org)
    .maybeSingle();
  const jaRealizada = !!(atual as { pol_visita_realizada_em: string | null } | null)?.pol_visita_realizada_em;

  const patch: Record<string, unknown> = {
    pol_visita_relato: (entrada.relato ?? "").trim() || null,
    pol_visita_presentes: (entrada.presentes ?? "").trim() || null,
    pol_visita_decisoes: (entrada.decisoes ?? "").trim() || null,
  };
  // Relato implica visita feita: se ainda não tinha data de realização, carimba hoje.
  if (!jaRealizada) patch.pol_visita_realizada_em = new Date().toISOString().slice(0, 10);

  const { error } = await db.from("demandas").update(patch).eq("id", demandaId).eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  await sincronizarVisitaNaAgenda(demandaId);
  void registrarEventoDemanda(demandaId, "nota", jaRealizada ? "Relato da visita técnica atualizado." : "Visita técnica realizada (com relato).");
  return { ok: true };
}

/** Registra um evento no histórico de uma demanda (escopado à org ativa). */
export async function registrarEventoDemanda(
  demandaId: string,
  tipo: "estado_alterado" | "nota" | "cidadao_avisado" | "oficio_emitido" | "encaminhamento_ia",
  descricao: string,
): Promise<AcaoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from("pol_demanda_eventos").insert({
    organization_id: org.orgId,
    demanda_id: demandaId,
    tipo,
    descricao,
    created_by: user.id,
  });
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

/** Exclui um registro de uma tabela do gabinete (escopado à org ativa). Para
 * `demandas`, os FKs cuidam do resto (anexos e vínculos de conversa em cascata,
 * referências em mensagens/conversas viram null). */
export async function excluirRegistro(tabela: string, id: string): Promise<AcaoResultado> {
  if (!TABELAS.has(tabela)) return { ok: false, erro: "Tabela inválida." };
  // Excluir é destrutivo: Gerente+ (Atendente cria e edita, não exclui).
  const org = await orgSeAoMenos("manager");
  if (!org) return { ok: false, erro: "Sem permissão para excluir (requer Gerente ou Administrador)." };
  const db = await createClient();
  const { error } = await db.from(tabela).delete().eq("id", id).eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

/**
 * Lista os anexos de uma demanda com URL assinada (1h) para download. O upload
 * é pela rota multipart; aqui só leitura + assinatura. O bucket é privado (sem
 * policy de storage), por isso a URL é assinada pelo admin client.
 */
export async function listarAnexosDemanda(demandaId: string): Promise<AnexoDemanda[]> {
  const org = await orgAtiva();
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_demanda_anexos")
    .select("id, storage_path, nome_arquivo, media_mime, media_size_bytes, created_at")
    .eq("organization_id", org)
    .eq("demanda_id", demandaId)
    .order("created_at", { ascending: true });
  const linhas = (data ?? []) as {
    id: string;
    storage_path: string;
    nome_arquivo: string;
    media_mime: string;
    media_size_bytes: number;
    created_at: string;
  }[];
  if (linhas.length === 0) return [];

  const admin = createAdminClient();
  const out: AnexoDemanda[] = [];
  for (const a of linhas) {
    const { data: signed } = await admin.storage.from(BUCKET_ANEXOS).createSignedUrl(a.storage_path, 60 * 60);
    out.push({
      id: a.id,
      nome_arquivo: a.nome_arquivo,
      media_mime: a.media_mime,
      media_size_bytes: a.media_size_bytes,
      created_at: a.created_at,
      url: signed?.signedUrl ?? null,
    });
  }
  return out;
}

/**
 * Remove um anexo (escopado à org ativa). Apagar a linha dispara o gatilho
 * `trg_pol_anexo_expurgo`, que enfileira o arquivo na fila de expurgo — o worker
 * de LGPD remove o binário do bucket. Nada fica órfão.
 */
export async function removerAnexoDemanda(anexoId: string): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();
  const { error } = await db.from("pol_demanda_anexos").delete().eq("id", anexoId).eq("organization_id", org);
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true };
}

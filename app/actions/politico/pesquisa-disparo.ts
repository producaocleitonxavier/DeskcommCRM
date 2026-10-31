"use server";

/**
 * Pesquisa Relâmpago — Fase 2 (DISPARO). Opção 1 refinada: a pesquisa orquestra,
 * mas o ENVIO reusa o motor de campanha (ritmo, opt-out, WAHA, retry, gate de
 * pré-go-live). Fluxo: resolve a audiência (opt-out excluído), gera um TOKEN por
 * contato (pol_survey_responses), grava o link de cada um em
 * contacts.custom_fields.pesquisa_link, e cria uma CAMPANHA (rascunho) com
 * incluir_contatos = exatamente esses contatos — garante link = destinatário.
 * O operador revisa e dá o start no Disparos (trilho seguro). Gate ADMIN/Gerente+
 * e trava TSE em intenção de voto.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarCandidatos } from "@/lib/campanhas/consulta-de-audiencia";
import { FILTRO_VAZIO } from "@/lib/campanhas/audiencia";
import { VARIAVEL_LINK } from "@/lib/politico/pesquisa-link";

export interface SegmentoPesquisa {
  niveis: ("novo_cadastro" | "simpatizante" | "apoiador" | "militante" | "voto_certo")[];
  temperaturas: ("frio" | "morno" | "quente")[];
  /** Origem do contato (contacts.source) — ex.: pesquisa, qr, saga_palestras. */
  origens: string[];
  /** IDs de contatos escolhidos a dedo (entram SEMPRE, em união com o recorte). */
  contatosIndividuais: string[];
  limite: number;
}

export interface ContatoEscolha { id: string; nome: string; telefone: string | null }

export type ResultadoDisparo =
  | { ok: true; campaignId: string; total: number }
  | { ok: false; erro: string; precisaTse?: boolean };

export async function prepararDisparoDaPesquisa(entrada: {
  surveyId: string;
  segmento: SegmentoPesquisa;
  mensagem: string;
  confirmaTse?: boolean;
}): Promise<ResultadoDisparo> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const bypass = user.is_platform_admin && !user.support;
  if (!bypass && ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  const orgId = org.orgId;

  const mensagem = (entrada.mensagem ?? "").trim();
  if (!mensagem.includes(VARIAVEL_LINK)) {
    return { ok: false, erro: `A mensagem precisa conter o link ${VARIAVEL_LINK} — é onde entra o link único de cada pessoa.` };
  }
  const { niveis, temperaturas } = entrada.segmento;
  const origens = (entrada.segmento.origens ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 20);
  const contatosIndividuais = [...new Set((entrada.segmento.contatosIndividuais ?? []).filter(Boolean))].slice(0, 5000);
  if (niveis.length === 0 && temperaturas.length === 0 && origens.length === 0 && contatosIndividuais.length === 0) {
    return { ok: false, erro: "Escolha um nível, temperatura, origem — ou contatos específicos." };
  }

  const admin = createAdminClient();

  const { data: survey } = await admin
    .from("pol_surveys")
    .select("id, title")
    .eq("id", entrada.surveyId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!survey) return { ok: false, erro: "Pesquisa não encontrada." };
  const s = survey as { id: string; title: string };

  // Trava TSE: se tem pergunta de intenção de voto, exige confirmação explícita.
  const { data: qs } = await admin.from("pol_survey_questions").select("theme").eq("survey_id", s.id).eq("organization_id", orgId);
  const temIntencao = ((qs ?? []) as { theme: string | null }[]).some((q) => q.theme === "intencao_voto");
  if (temIntencao && !entrada.confirmaTse) {
    return { ok: false, erro: "Esta pesquisa tem intenção de voto. Confirme que é uso INTERNO (sentir a base) — divulgar publicamente exige registro no TSE.", precisaTse: true };
  }

  // Canal de WhatsApp da org.
  const { data: canal } = await admin.from("channel_sessions").select("id").eq("organization_id", orgId).limit(1).maybeSingle();
  if (!canal) return { ok: false, erro: "Conecte um WhatsApp em Canais antes de disparar." };
  const canalId = String((canal as { id: string }).id);

  // Audiência (opt-out/bloqueado excluído; só com telefone).
  const limite = Math.min(5000, Math.max(1, entrada.segmento.limite || 500));
  const filtro = { ...FILTRO_VAZIO, niveis_de_apoio: niveis, temperaturas, origens, incluir_contatos: contatosIndividuais, limite };
  const { candidatos } = await buscarCandidatos(admin, { organizationId: orgId, filtro, agora: new Date() });
  // Opt-out/LGPD: bloqueado (descadastro) e quem recusou marketing saem; pessoais/
  // anonimizados também; só com telefone. O motor confere de novo no envio.
  const elegiveis = candidatos.filter(
    (c) => !c.bloqueado && !c.recusouMarketing && !c.pessoal && !c.anonimizado && (c.telefone ?? "").trim(),
  );
  if (elegiveis.length === 0) {
    return { ok: false, erro: "Nenhum contato elegível nesse segmento (sem telefone ou descadastrado)." };
  }
  const ids = elegiveis.map((c) => c.contactId);

  // Base URL (para montar o link público).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) return { ok: false, erro: "Não consegui montar o link agora. Tente de novo." };
  const base = `${proto}://${host}`;

  // Tokens por contato (idempotente: reusa os existentes).
  const { data: existentes } = await admin.from("pol_survey_responses").select("contact_id, token").eq("survey_id", s.id).eq("organization_id", orgId).in("contact_id", ids);
  const tokenPorContato = new Map<string, string>();
  for (const r of (existentes ?? []) as { contact_id: string | null; token: string }[]) if (r.contact_id) tokenPorContato.set(r.contact_id, r.token);
  const novos = elegiveis.filter((c) => !tokenPorContato.has(c.contactId));
  if (novos.length) {
    const rows = novos.map((c) => ({ organization_id: orgId, survey_id: s.id, contact_id: c.contactId }));
    const { data: inseridos } = await admin.from("pol_survey_responses").insert(rows).select("contact_id, token");
    for (const r of (inseridos ?? []) as { contact_id: string | null; token: string }[]) if (r.contact_id) tokenPorContato.set(r.contact_id, r.token);
  }

  // Grava o link de cada um em custom_fields.pesquisa_link (merge, em lotes).
  const { data: contatos } = await admin.from("contacts").select("id, custom_fields").in("id", ids).eq("organization_id", orgId);
  const lista = (contatos ?? []) as { id: string; custom_fields: Record<string, unknown> | null }[];
  for (let i = 0; i < lista.length; i += 40) {
    await Promise.all(
      lista.slice(i, i + 40).map((c) => {
        const token = tokenPorContato.get(c.id);
        if (!token) return Promise.resolve();
        const cf = { ...(c.custom_fields ?? {}), pesquisa_link: `${base}/pesquisa/${token}` };
        return admin.from("contacts").update({ custom_fields: cf }).eq("id", c.id).eq("organization_id", orgId);
      }),
    );
  }

  // Cria o disparo (rascunho) — incluir_contatos = exatamente os elegíveis.
  const filtroCampanha = { ...FILTRO_VAZIO, incluir_contatos: ids.slice(0, 5000), limite: Math.min(5000, ids.length) };
  const { data: camp, error: campErr } = await admin
    .from("campaigns")
    .insert({
      organization_id: orgId,
      name: `Pesquisa: ${s.title}`.slice(0, 160),
      channel_session_id: canalId,
      message_body: mensagem,
      base_legal: "consent",
      audience_filter: filtroCampanha,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (campErr || !camp) return { ok: false, erro: "Não consegui criar o disparo agora." };

  revalidatePath("/app/campaigns");
  revalidatePath("/app/politico/pesquisas");
  return { ok: true, campaignId: String((camp as { id: string }).id), total: elegiveis.length };
}

/** Papel manager+ ou null (sem vazar motivo). */
async function orgGerenteId(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const bypass = user.is_platform_admin && !user.support;
  if (!bypass && ROLE_RANK[org.role] < ROLE_RANK.manager) return null;
  return org.orgId;
}

/** Origens (contacts.source) distintas da org — vira chips de filtro no disparo. */
export async function origensDaOrg(): Promise<{ origem: string; total: number }[]> {
  const orgId = await orgGerenteId();
  if (!orgId) return [];
  const admin = createAdminClient();
  const { data } = await admin.from("contacts").select("source").eq("organization_id", orgId).not("source", "is", null).is("is_merged_into", null).limit(20000);
  const map = new Map<string, number>();
  for (const r of (data ?? []) as { source: string | null }[]) {
    const s = (r.source ?? "").trim();
    if (s) map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()].map(([origem, total]) => ({ origem, total })).sort((a, b) => b.total - a.total).slice(0, 20);
}

/** Busca contatos por nome/telefone para a seleção INDIVIDUAL do disparo. */
export async function buscarContatosParaDisparo(q: string): Promise<ContatoEscolha[]> {
  const orgId = await orgGerenteId();
  if (!orgId) return [];
  const termo = (q ?? "").trim();
  if (termo.length < 2) return [];
  const safe = termo.replace(/[,()*%\\]/g, " ").trim();
  const digits = termo.replace(/\D/g, "");
  const admin = createAdminClient();
  let consulta = admin
    .from("contacts")
    .select("id, name, phone_number")
    .eq("organization_id", orgId)
    .is("is_merged_into", null)
    .eq("is_blocked", false)
    .limit(15);
  if (digits.length >= 4) consulta = consulta.or(`name.ilike.%${safe}%,phone_number.ilike.%${digits}%`);
  else if (safe.length >= 2) consulta = consulta.ilike("name", `%${safe}%`);
  else return [];
  const { data } = await consulta;
  return ((data ?? []) as { id: string; name: string | null; phone_number: string | null }[]).map((c) => ({
    id: c.id, nome: c.name ?? "(sem nome)", telefone: c.phone_number,
  }));
}

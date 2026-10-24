"use server";

/**
 * Server actions do funil de EVENTOS (Fase 2). Como o resto do módulo político, o
 * client do browser não vê a sessão (cookie httpOnly) → tudo passa por aqui, no
 * servidor, com o client autenticado (RLS libera a org ativa). `organization_id`
 * vem SEMPRE de resolveActiveOrg, nunca do input.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type AcaoResultado = { ok: true; id?: string } | { ok: false; erro: string };

async function orgAtiva(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  return org?.orgId ?? null;
}

function traduzErro(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um registro com esse identificador.";
  if (error.code === "23514") return "Algum valor está fora do permitido para este campo.";
  return error.message;
}

function normalizarTelefone(tel: string): string | null {
  const d = tel.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return "+" + d;
  if (d.length === 10 || d.length === 11) return "+55" + d;
  return "+" + d;
}

export interface NovoLocalInput {
  nome: string;
  tipo: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  endereco?: string;
  /** Registrar também o evento/palestra neste local? */
  comEvento: boolean;
  tema?: string;
  tipoEvento?: string;
  data?: string;
  publicoEstimado?: number;
  /** Material da Biblioteca a enviar (Fase 2C — ebook por evento). */
  materialId?: string;
}

/**
 * Cria um Local (escola/igreja/...) e, opcionalmente, o evento (palestra/visita)
 * nele. O evento nasce ligado ao local (`local_id`), e vários eventos/visitas
 * agrupam sob o mesmo local — é o "card da escola".
 */
export async function criarLocalComEvento(dados: NovoLocalInput): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (!dados.nome.trim()) return { ok: false, erro: "Informe o nome do local." };
  const db = await createClient();

  const localPayload: Record<string, unknown> = {
    organization_id: org,
    nome: dados.nome.trim(),
    tipo: dados.tipo,
  };
  if (dados.bairro?.trim()) localPayload.bairro = dados.bairro.trim();
  if (dados.cidade?.trim()) localPayload.cidade = dados.cidade.trim();
  if (dados.uf?.trim()) localPayload.uf = dados.uf.trim().toUpperCase().slice(0, 2);
  if (dados.cep?.trim()) localPayload.cep = dados.cep.trim();
  if (dados.endereco?.trim()) localPayload.endereco = dados.endereco.trim();

  const { data: local, error: errLocal } = await db
    .from("pol_locais")
    .insert(localPayload)
    .select("id")
    .maybeSingle();
  if (errLocal) return { ok: false, erro: traduzErro(errLocal) };
  const localId = (local?.id as string | undefined) ?? undefined;
  if (!localId) return { ok: false, erro: "Não foi possível criar o local." };

  // Fase 2B: deriva a zona eleitoral pelo bairro (dados do TSE) e carimba no local.
  // É enriquecimento — se o TSE não resolver, o local fica sem zona e não falha o cadastro.
  if (dados.bairro?.trim() && dados.cidade?.trim()) {
    try {
      const { data: zona } = await db.rpc("intel_zona_do_bairro", {
        p_municipio_nome: dados.cidade.trim(),
        p_uf: dados.uf?.trim() ? dados.uf.trim().toUpperCase().slice(0, 2) : null,
        p_bairro: dados.bairro.trim(),
        p_ano: 2024,
      });
      if (zona != null) {
        await db.from("pol_locais").update({ zona_eleitoral: String(zona) }).eq("id", localId).eq("organization_id", org);
      }
    } catch {
      /* zona é opcional */
    }
  }

  if (dados.comEvento) {
    const eventoPayload: Record<string, unknown> = {
      organization_id: org,
      title: dados.tema?.trim() ? `${dados.tema.trim()} — ${dados.nome.trim()}` : dados.nome.trim(),
      type: dados.tipoEvento || "visita",
      local_id: localId,
      event_date: dados.data ? new Date(dados.data).toISOString() : new Date().toISOString(),
      status: "scheduled",
    };
    if (dados.tema?.trim()) eventoPayload.theme = dados.tema.trim();
    if (dados.bairro?.trim()) eventoPayload.neighborhood = dados.bairro.trim();
    if (dados.cidade?.trim()) eventoPayload.city = dados.cidade.trim();
    if (dados.uf?.trim()) eventoPayload.state = dados.uf.trim().toUpperCase().slice(0, 2);
    if (typeof dados.publicoEstimado === "number" && dados.publicoEstimado > 0) {
      eventoPayload.estimated_audience = dados.publicoEstimado;
    }
    if (dados.materialId) eventoPayload.material_id = dados.materialId;
    // Se o evento falhar, o local já existe — não desfaz o cadastro do local.
    await db.from("pol_events").insert(eventoPayload);
  }

  return { ok: true, id: localId };
}

/** Cria um evento (palestra/visita) ligado a um local existente. */
export async function criarEventoNoLocal(
  localId: string,
  dados: { tema?: string; tipoEvento?: string; data?: string; publicoEstimado?: number; materialId?: string },
): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  // Confirma que o local é da org (defesa; a RLS também cobre) e pega bairro/cidade.
  const { data: local } = await db
    .from("pol_locais")
    .select("nome, bairro, cidade, uf")
    .eq("organization_id", org)
    .eq("id", localId)
    .maybeSingle();
  if (!local) return { ok: false, erro: "Local não encontrado." };
  const l = local as Record<string, unknown>;

  const eventoPayload: Record<string, unknown> = {
    organization_id: org,
    title: dados.tema?.trim() ? `${dados.tema.trim()} — ${String(l.nome ?? "")}` : String(l.nome ?? "Evento"),
    type: dados.tipoEvento || "visita",
    local_id: localId,
    event_date: dados.data ? new Date(dados.data).toISOString() : new Date().toISOString(),
    status: "scheduled",
  };
  if (dados.tema?.trim()) eventoPayload.theme = dados.tema.trim();
  if (l.bairro) eventoPayload.neighborhood = l.bairro;
  if (l.cidade) eventoPayload.city = l.cidade;
  if (l.uf) eventoPayload.state = l.uf;
  if (typeof dados.publicoEstimado === "number" && dados.publicoEstimado > 0) {
    eventoPayload.estimated_audience = dados.publicoEstimado;
  }
  if (dados.materialId) eventoPayload.material_id = dados.materialId;

  const { data: ev, error } = await db.from("pol_events").insert(eventoPayload).select("id").maybeSingle();
  if (error) return { ok: false, erro: traduzErro(error) };
  return { ok: true, id: (ev?.id as string | undefined) ?? undefined };
}

/**
 * Registra uma pessoa num evento: cria o contato, cria o pol_lead em
 * `novo_cadastro` (idempotente) e grava a presença. É a porta de entrada do
 * funil — daqui a pessoa segue para o nurture (Fase 2C).
 */
export async function registrarPessoaEmEvento(
  eventId: string,
  pessoa: { nome: string; telefone?: string; bairro?: string; relacao?: string },
): Promise<AcaoResultado> {
  const org = await orgAtiva();
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (!pessoa.nome.trim()) return { ok: false, erro: "Informe o nome da pessoa." };
  const db = await createClient();

  // 1) Contato
  const contatoPayload: Record<string, unknown> = {
    organization_id: org,
    name: pessoa.nome.trim(),
    source: "evento",
  };
  const fone = pessoa.telefone ? normalizarTelefone(pessoa.telefone) : null;
  if (fone) contatoPayload.phone_number = fone;
  if (pessoa.bairro?.trim()) {
    contatoPayload.custom_fields = { endereco_gip: { bairro: pessoa.bairro.trim() } };
  }
  const { data: contato, error: errC } = await db
    .from("contacts")
    .insert(contatoPayload)
    .select("id")
    .maybeSingle();
  if (errC) return { ok: false, erro: traduzErro(errC) };
  const contactId = (contato?.id as string | undefined) ?? undefined;
  if (!contactId) return { ok: false, erro: "Não foi possível criar o contato." };

  // 2) pol_lead em novo_cadastro (idempotente por contato+org)
  const { data: leadExistente } = await db
    .from("pol_leads")
    .select("id")
    .eq("organization_id", org)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!leadExistente) {
    const { error: errL } = await db.from("pol_leads").insert({
      organization_id: org,
      contact_id: contactId,
      support_level: "novo_cadastro",
      consent_origin: "evento",
    });
    if (errL) return { ok: false, erro: traduzErro(errL) };
  }

  // 3) Presença no evento (a relação com o local vai em notes — o CHECK de role é fechado)
  const presencaPayload: Record<string, unknown> = {
    organization_id: org,
    event_id: eventId,
    contact_id: contactId,
    role: "participante",
    checked_in_at: new Date().toISOString(),
  };
  if (pessoa.relacao?.trim()) presencaPayload.notes = pessoa.relacao.trim();
  const { error: errA } = await db.from("pol_event_attendance").insert(presencaPayload);
  if (errA) return { ok: false, erro: traduzErro(errA) };

  return { ok: true, id: contactId };
}

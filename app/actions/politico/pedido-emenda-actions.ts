"use server";

/**
 * CAPTAÇÃO DE PEDIDOS DE EMENDA — efeitos no banco (pol_emendas).
 *
 * Um pedido é uma emenda com status 'solicitada' (ainda não decidida; fora das
 * somas do painel). O gabinete ATENDE (→ 'indicada') ou RECUSA (→ 'cancelada' +
 * motivo). Gate manager+. A regra pura (quem pode) vive em lib/politico/pedido-emenda.
 */

import { revalidatePath } from "next/cache";

import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { classificarArea } from "@/lib/politico/emenda-classificar";
import { lerMandatoConfig } from "@/lib/politico/setup-do-mandato";
import { validarAtender, validarRecusar, origemValida } from "@/lib/politico/pedido-emenda";

export type ResultadoPedido = { ok: true; id?: string } | { ok: false; error: string };

interface Guard {
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
}

/** Autoriza manager+ e devolve o admin client + orgId; ou um erro pronto. */
async function autorizar(): Promise<{ guard: Guard } | { error: ResultadoPedido }> {
  const user = await loadAuthUser();
  if (!user) return { error: { ok: false, error: "unauthenticated" } };
  if (supportWriteError(user.support)) return { error: { ok: false, error: "forbidden_role" } };
  const org = await resolveActiveOrg(user);
  if (!org) return { error: { ok: false, error: "forbidden_tenant" } };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { error: { ok: false, error: "forbidden_role" } };
  if (await mfaEmDivida()) return { error: { ok: false, error: "mfa_required" } };
  return { guard: { admin: createAdminClient(), orgId: org.orgId } };
}

function esferaDoMandato(settings: unknown): "municipal" | "estadual" | "federal" {
  const tipo = lerMandatoConfig(settings)?.tipo ?? "vereador";
  if (tipo === "dep_federal") return "federal";
  if (tipo === "dep_estadual") return "estadual";
  return "municipal";
}

export interface NovoPedidoInput {
  solicitanteNome: string;
  solicitanteOrigem: string; // texto livre: de onde veio o pedido (Guarda Municipal, Prefeitura…)
  objeto: string;            // o que pede (livre) — base da classificação
  descricao?: string;
  valorIndicadoCents?: number;
  municipio?: string;
  bairro?: string;
}

/** Registra um PEDIDO (status 'solicitada'). Área classificada automática. */
export async function criarPedidoEmenda(input: NovoPedidoInput): Promise<ResultadoPedido> {
  const a = await autorizar();
  if ("error" in a) return a.error;
  const { admin, orgId } = a.guard;

  const nome = (input.solicitanteNome ?? "").trim();
  const objeto = (input.objeto ?? "").trim();
  const descricao = (input.descricao ?? "").trim();
  if (!nome) return { ok: false, error: "Informe quem está pedindo." };
  if (!objeto && !descricao) return { ok: false, error: "Descreva o que está sendo pedido." };

  try {
    const { data: orgRow } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
    const esfera = esferaDoMandato((orgRow as { settings?: unknown } | null)?.settings);
    const area = classificarArea(`${objeto} ${descricao}`);

    const { data, error } = await admin
      .from("pol_emendas")
      .insert({
        organization_id: orgId,
        ano: new Date().getFullYear(),
        esfera,
        status: "solicitada",
        area_tematica: area,
        objeto: objeto || null,
        descricao: descricao || objeto || "Pedido de emenda",
        valor_indicado_cents: Math.max(0, Math.round(input.valorIndicadoCents ?? 0)),
        municipio: (input.municipio ?? "").trim() || null,
        bairro: (input.bairro ?? "").trim() || null,
        solicitante_nome: nome,
        solicitante_origem: origemValida(input.solicitanteOrigem),
        data_solicitacao: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: "Não foi possível registrar o pedido." };
    revalidatePath("/app/politico/emendas/pedidos");
    revalidatePath("/app/politico/emendas");
    return { ok: true, id: (data as { id: string }).id };
  } catch {
    return { ok: false, error: "Erro inesperado ao registrar o pedido." };
  }
}

/** Lê o status atual do pedido garantindo que é da org. */
async function statusDoPedido(admin: Guard["admin"], orgId: string, emendaId: string): Promise<string | null> {
  const { data } = await admin
    .from("pol_emendas")
    .select("status")
    .eq("id", emendaId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data as { status: string } | null)?.status ?? null;
}

/** ATENDE um pedido: 'solicitada' → 'indicada' (com data de indicação de hoje). */
export async function atenderPedido(emendaId: string): Promise<ResultadoPedido> {
  const a = await autorizar();
  if ("error" in a) return a.error;
  const { admin, orgId } = a.guard;
  try {
    const status = await statusDoPedido(admin, orgId, emendaId);
    if (status === null) return { ok: false, error: "Pedido não encontrado." };
    const v = validarAtender(status);
    if (!v.ok) return { ok: false, error: v.erro ?? "Não é possível atender." };
    const { error } = await admin
      .from("pol_emendas")
      .update({ status: "indicada", data_indicacao: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
      .eq("id", emendaId)
      .eq("organization_id", orgId);
    if (error) return { ok: false, error: "Não foi possível atender o pedido." };
    revalidatePath("/app/politico/emendas/pedidos");
    revalidatePath("/app/politico/emendas");
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao atender." };
  }
}

/** RECUSA um pedido: 'solicitada' → 'cancelada' (com o motivo registrado). */
export async function recusarPedido(emendaId: string, motivo: string): Promise<ResultadoPedido> {
  const a = await autorizar();
  if ("error" in a) return a.error;
  const { admin, orgId } = a.guard;
  try {
    const status = await statusDoPedido(admin, orgId, emendaId);
    if (status === null) return { ok: false, error: "Pedido não encontrado." };
    const v = validarRecusar(status, motivo);
    if (!v.ok) return { ok: false, error: v.erro ?? "Não é possível recusar." };
    const { error } = await admin
      .from("pol_emendas")
      .update({ status: "cancelada", motivo_recusa: motivo.trim(), updated_at: new Date().toISOString() })
      .eq("id", emendaId)
      .eq("organization_id", orgId);
    if (error) return { ok: false, error: "Não foi possível recusar o pedido." };
    revalidatePath("/app/politico/emendas/pedidos");
    revalidatePath("/app/politico/emendas");
    return { ok: true };
  } catch {
    return { ok: false, error: "Erro inesperado ao recusar." };
  }
}

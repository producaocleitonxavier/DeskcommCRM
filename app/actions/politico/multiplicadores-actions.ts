"use server";

/**
 * Ações da tela de MULTIPLICADORES: marcar/desmarcar um contato como
 * multiplicador (etiqueta "multiplicador" em `contacts.tags`) e buscar contatos
 * pra marcar. Como o resto do político: tudo no servidor, client autenticado
 * (RLS libera só a org), `organization_id` vem de resolveActiveOrg — nunca do input.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { TAG_MULTIPLICADOR } from "@/lib/politico/multiplicadores";

export type AcaoResultado = { ok: true } | { ok: false; erro: string };

/** Liga/desliga a etiqueta "multiplicador" num contato, sem duplicar. */
async function alternarTag(contactId: string, adicionar: boolean): Promise<AcaoResultado> {
  const cid = (contactId ?? "").trim();
  if (!cid) return { ok: false, erro: "Contato inválido." };

  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data: ct, error: erroLe } = await db
    .from("contacts")
    .select("id, tags")
    .eq("organization_id", org.orgId)
    .eq("id", cid)
    .maybeSingle();
  if (erroLe) return { ok: false, erro: erroLe.message };
  if (!ct) return { ok: false, erro: "Pessoa não encontrada." };

  const atuais = (((ct as { tags: string[] | null }).tags ?? []) as string[]).filter(
    (t) => typeof t === "string",
  );
  const semTag = atuais.filter((t) => t !== TAG_MULTIPLICADOR);
  const novas = adicionar ? [...semTag, TAG_MULTIPLICADOR] : semTag;

  const { error: erroUpd } = await db
    .from("contacts")
    .update({ tags: novas })
    .eq("id", cid)
    .eq("organization_id", org.orgId);
  if (erroUpd) return { ok: false, erro: erroUpd.message };

  revalidatePath("/app/politico/multiplicadores");
  return { ok: true };
}

export async function adicionarMultiplicador(contactId: string): Promise<AcaoResultado> {
  return alternarTag(contactId, true);
}

export async function removerMultiplicador(contactId: string): Promise<AcaoResultado> {
  return alternarTag(contactId, false);
}

export interface ContatoParaMarcar {
  id: string;
  nome: string;
  telefone: string | null;
}

/** Busca por nome contatos da org que AINDA não são multiplicadores (pra marcar). */
export async function buscarContatosParaMarcar(termo: string): Promise<ContatoParaMarcar[]> {
  const q = (termo ?? "").trim();
  if (q.length < 2) return [];

  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();

  // Busca por nome OU telefone (muito contato tem só o 1º nome). ≥4 dígitos = telefone.
  const soDigitos = q.replace(/\D/g, "");
  const base = db.from("contacts").select("id, name, phone_number, tags").eq("organization_id", org.orgId);
  const { data } = await (
    soDigitos.length >= 4 ? base.ilike("phone_number", `%${soDigitos}%`) : base.ilike("name", `%${q}%`)
  ).limit(20);

  const rows = (data ?? []) as {
    id: string;
    name: string | null;
    phone_number: string | null;
    tags: string[] | null;
  }[];
  return rows
    .filter((r) => !((r.tags ?? []) as string[]).includes(TAG_MULTIPLICADOR))
    .slice(0, 12)
    .map((r) => ({ id: r.id, nome: r.name ?? "Sem nome", telefone: r.phone_number ?? null }));
}

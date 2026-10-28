"use server";

/**
 * Busca de OFÍCIOS do gabinete. Um ofício "existe" quando a demanda tem número
 * preenchido (`pol_oficio_rotulo`). A busca casa por número, assunto, órgão,
 * destinatário E nome do cidadão — pra achar um documento entre centenas.
 *
 * Tudo no servidor (sessão autenticada, RLS + filtro explícito de org).
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export interface OficioItem {
  demandaId: string;
  rotulo: string;
  emitidoEm: string;
  cidadaoNome: string | null;
  assunto: string | null;
  orgao: string | null;
}

const PAGINA = 20;

export async function buscarOficios(
  termo?: string,
  pagina = 0,
): Promise<{ itens: OficioItem[]; temMais: boolean }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { itens: [], temMais: false };
  const db = await createClient();

  const inicio = Math.max(0, pagina) * PAGINA;
  let q = db
    .from("demandas")
    .select("id, pol_oficio_rotulo, pol_oficio_assunto, assunto, pol_orgao_destino, updated_at, contacts(name)")
    .eq("organization_id", org.orgId)
    .not("pol_oficio_rotulo", "is", null)
    .order("updated_at", { ascending: false })
    .range(inicio, inicio + PAGINA); // +1 item pra saber se há próxima página

  // Sanitiza o termo: vírgulas/parênteses quebram a sintaxe do `.or` do PostgREST.
  const t = (termo ?? "").replace(/[,()%*]/g, " ").trim();
  if (t) {
    // Nome do cidadão vive em outra tabela — acha os ids primeiro e inclui no OR.
    const { data: cs } = await db
      .from("contacts")
      .select("id")
      .eq("organization_id", org.orgId)
      .ilike("name", `%${t}%`)
      .limit(100);
    const ids = ((cs ?? []) as { id: string }[]).map((c) => c.id);
    const partes = [
      `pol_oficio_rotulo.ilike.%${t}%`,
      `pol_oficio_assunto.ilike.%${t}%`,
      `assunto.ilike.%${t}%`,
      `pol_orgao_destino.ilike.%${t}%`,
    ];
    if (ids.length) partes.push(`contact_id.in.(${ids.join(",")})`);
    q = q.or(partes.join(","));
  }

  const { data, error } = await q;
  if (error || !data) return { itens: [], temMais: false };

  const linhas = data as unknown as {
    id: string;
    pol_oficio_rotulo: string | null;
    pol_oficio_assunto: string | null;
    assunto: string | null;
    pol_orgao_destino: string | null;
    updated_at: string;
    contacts: { name: string | null } | null;
  }[];

  const temMais = linhas.length > PAGINA;
  const itens: OficioItem[] = linhas.slice(0, PAGINA).map((d) => ({
    demandaId: d.id,
    rotulo: (d.pol_oficio_rotulo ?? "").trim() || `#${d.id.slice(0, 8).toUpperCase()}`,
    emitidoEm: d.updated_at,
    cidadaoNome: d.contacts?.name ?? null,
    assunto: (d.pol_oficio_assunto ?? d.assunto ?? "").trim() || null,
    orgao: (d.pol_orgao_destino ?? "").trim() || null,
  }));

  return { itens, temMais };
}

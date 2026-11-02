/**
 * GRUPOS DE ORIGEM (camaleão) — leitura.
 *
 * Junta três coisas: as origens distintas da base (`pol_vw_origens`, com
 * contagem), os grupos que o cliente criou (`pol_origem_grupos`) e o mapeamento
 * origem→grupo (`pol_origem_mapeamento`). Devolve os grupos já com as suas
 * origens dentro, e as origens sem grupo em "A classificar".
 *
 * As ações de escrita vivem em `app/actions/politico/grupos-origem-actions.ts`
 * (este arquivo é só leitura, e recebe o `db` já autenticado — por isso não é
 * "use server").
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { humanizarOrigem } from "@/lib/politico/rotulo-origem";

export interface OrigemComContagem {
  source: string;
  label: string;
  total: number;
}

export interface GrupoDeOrigem {
  id: string;
  nome: string;
  ordem: number;
  origens: OrigemComContagem[];
}

export interface OrigensEGrupos {
  grupos: GrupoDeOrigem[];
  aClassificar: OrigemComContagem[];
}

export async function listarOrigensEGrupos(
  db: SupabaseClient,
  orgId: string,
): Promise<OrigensEGrupos> {
  const [origensRes, gruposRes, mapaRes] = await Promise.all([
    db.from("pol_vw_origens").select("source, total").eq("organization_id", orgId),
    db
      .from("pol_origem_grupos")
      .select("id, nome, ordem")
      .eq("organization_id", orgId)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true }),
    db.from("pol_origem_mapeamento").select("source, grupo_id").eq("organization_id", orgId),
  ]);

  const origens = (origensRes.data ?? []) as { source: string; total: number }[];
  const gruposRaw = (gruposRes.data ?? []) as { id: string; nome: string; ordem: number }[];
  const mapa = (mapaRes.data ?? []) as { source: string; grupo_id: string }[];

  const grupoPorSource = new Map(mapa.map((m) => [m.source, m.grupo_id]));

  const grupos: GrupoDeOrigem[] = gruposRaw.map((g) => ({
    id: g.id,
    nome: g.nome,
    ordem: g.ordem,
    origens: [],
  }));
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const aClassificar: OrigemComContagem[] = [];

  // Origem com mais gente primeiro — o que importa salta aos olhos.
  const ordenadas = [...origens].sort((a, b) => Number(b.total) - Number(a.total));
  for (const o of ordenadas) {
    const item: OrigemComContagem = {
      source: o.source,
      label: humanizarOrigem(o.source),
      total: Number(o.total) || 0,
    };
    const gid = grupoPorSource.get(o.source);
    const grupo = gid ? grupoPorId.get(gid) : undefined;
    if (grupo) grupo.origens.push(item);
    else aClassificar.push(item);
  }

  return { grupos, aClassificar };
}

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

import { humanizarOrigem, ORIGENS_OCULTAS, LIMIAR_POUCAS } from "@/lib/politico/rotulo-origem";

export interface OrigemComContagem {
  source: string;
  label: string;
  total: number;
  /** Grupo sugerido (por semelhança de nome) pra uma origem sem grupo — aceite num clique. */
  sugestaoGrupoId?: string;
  sugestaoGrupoNome?: string;
}

/** Tokens úteis de um texto (minúsculo, sem acento, palavras ≥4 letras). */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
}

/**
 * Sugere um grupo pra uma origem SEM grupo, casando o NOME da origem com o NOME
 * do grupo (ex.: "Palestra Escola X" → grupo "Palestras"). Só nome, de propósito:
 * casar com as origens já agrupadas traria ruído (ex.: "Escola"/"Teste" casam
 * tudo). Conservador — sem match, não sugere nada (o cliente classifica à mão).
 */
function sugerirGrupo(
  label: string,
  source: string,
  grupos: GrupoDeOrigem[],
): { id: string; nome: string } | null {
  const ot = tokens(`${label} ${source}`);
  let best: GrupoDeOrigem | null = null;
  let bestScore = 0;
  for (const g of grupos) {
    const gt = tokens(g.nome);
    let score = 0;
    for (const t of ot) {
      for (const u of gt) {
        if (t === u || t.startsWith(u) || u.startsWith(t)) {
          score++;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best && bestScore >= 1 ? { id: best.id, nome: best.nome } : null;
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
  /** Origens sem grupo e com pouca gente (≤ LIMIAR_POUCAS) — seção "Outras" recolhida. */
  outrasPoucas: OrigemComContagem[];
}

export interface ConversaoOrigem {
  source: string;
  label: string;
  total: number;
  convertidos: number;
  /** % que virou Participante ou Multiplicador (apoiador/militante + voto_certo antigo), 0–100. */
  pct: number;
}

/** Mínimo de pessoas pra uma origem entrar no ranking — abaixo disso o % é ruído. */
const MIN_PARA_CONVERSAO = 5;

/**
 * "ONDE INVESTIR" — conversão por origem (quem virou apoiador+). Ranqueado do
 * melhor pro pior: o gabinete vê de qual origem vale fazer o próximo evento/material.
 */
export async function conversaoDasOrigens(
  db: SupabaseClient,
  orgId: string,
): Promise<ConversaoOrigem[]> {
  const { data } = await db
    .from("pol_vw_origem_conversao")
    .select("source, total, convertidos")
    .eq("organization_id", orgId);
  const rows = (data ?? []) as { source: string; total: number; convertidos: number }[];
  return rows
    .filter((r) => !ORIGENS_OCULTAS.has(r.source) && Number(r.total) >= MIN_PARA_CONVERSAO)
    .map((r) => {
      const total = Number(r.total) || 0;
      const convertidos = Number(r.convertidos) || 0;
      return {
        source: r.source,
        label: humanizarOrigem(r.source),
        total,
        convertidos,
        pct: total > 0 ? Math.round((convertidos / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct || b.total - a.total);
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
  const outrasPoucas: OrigemComContagem[] = [];

  // Origem com mais gente primeiro — o que importa salta aos olhos.
  const ordenadas = [...origens].sort((a, b) => Number(b.total) - Number(a.total));
  for (const o of ordenadas) {
    // Origem de SISTEMA (marcador técnico) não é "de onde a pessoa veio": some.
    if (ORIGENS_OCULTAS.has(o.source)) continue;
    const item: OrigemComContagem = {
      source: o.source,
      label: humanizarOrigem(o.source),
      total: Number(o.total) || 0,
    };
    const gid = grupoPorSource.get(o.source);
    const grupo = gid ? grupoPorId.get(gid) : undefined;
    // Agrupada fica no grupo (mesmo pequena — o cliente a escolheu). Sem grupo e
    // com pouca gente vai pra "Outras" recolhida, pra não poluir "A classificar".
    if (grupo) {
      grupo.origens.push(item);
    } else {
      // Sem grupo: tenta sugerir um (por nome) pra o cliente aceitar num clique.
      const sug = sugerirGrupo(item.label, item.source, grupos);
      if (sug) {
        item.sugestaoGrupoId = sug.id;
        item.sugestaoGrupoNome = sug.nome;
      }
      if (item.total <= LIMIAR_POUCAS) outrasPoucas.push(item);
      else aClassificar.push(item);
    }
  }

  return { grupos, aClassificar, outrasPoucas };
}

/**
 * MULTIPLICADORES (camada de leitura) — o placar de quem divulga.
 *
 * Cohort = contatos marcados com a tag "multiplicador" (`contacts.tags`). Para
 * cada um, junta quanto ELE TROUXE (indicação creditada, `pol_indicacoes`) e
 * quanto ALCANÇOU (cliques distintos nos vídeos que compartilhou,
 * `fn_alcance_por_contato`). Inclui os ZEROS DE PROPÓSITO: ver quem AINDA NÃO
 * divulgou é o ponto — é a "certeza" que o gabinete quer.
 *
 * Só leitura; recebe o `db` já autenticado (a RLS libera só a org) — por isso
 * não é "use server". As ações de escrita vivem em
 * `app/actions/politico/multiplicadores-actions.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { TAG_DIVULGADOR } from "@/lib/politico/divulgador";

/** A etiqueta que marca um contato como multiplicador (assessor/liderança/apoiador que divulga). */
export const TAG_MULTIPLICADOR = "multiplicador";

/**
 * Tipo do multiplicador — separa quem é quem no placar (decisão do cliente).
 * ASSESSOR = marcado por função (só tag `multiplicador`). DIVULGADOR = entrou por
 * convite+aceite (tem também a tag `divulgador`). Mesma máquina de medição.
 */
export type TipoMultiplicador = "assessor" | "divulgador";

export interface MultiplicadorRow {
  contactId: string;
  nome: string;
  /** Cliques distintos nos vídeos que ELE compartilhou (alcance estimado). */
  alcancou: number;
  /** Pessoas que ELE trouxe (indicação creditada) — o ouro. */
  trouxe: number;
  ultimaAtividadeISO: string | null;
  /** Já divulgou de fato (gerou algum alcance). */
  compartilhou: boolean;
  /** Já recebeu o link pessoal de algum vídeo (existe share pessoal dele). */
  recebeuLink: boolean;
  /** Assessor (marcado) ou divulgador (entrou por convite+aceite). */
  tipo: TipoMultiplicador;
}

export interface SugestaoMultiplicador {
  contactId: string;
  nome: string;
  trouxe: number;
  alcancou: number;
}

/** Lê os dois sinais da org: quem TROUXE (indicações) e quem ALCANÇOU (vídeo). */
async function lerSinais(
  db: SupabaseClient,
  orgId: string,
): Promise<{ trouxeDe: Map<string, number>; alcancouDe: Map<string, number> }> {
  const [{ data: inds }, { data: alc }] = await Promise.all([
    db.from("pol_indicacoes").select("indicador_contact_id").eq("organization_id", orgId).limit(5000),
    db.rpc("fn_alcance_por_contato", { p_org: orgId }),
  ]);
  const trouxeDe = new Map<string, number>();
  for (const r of (inds ?? []) as { indicador_contact_id: string }[]) {
    trouxeDe.set(r.indicador_contact_id, (trouxeDe.get(r.indicador_contact_id) ?? 0) + 1);
  }
  const alcancouDe = new Map<string, number>();
  for (const r of (alc ?? []) as { contact_id: string; alcancou: number | string }[]) {
    alcancouDe.set(r.contact_id, Number(r.alcancou) || 0);
  }
  return { trouxeDe, alcancouDe };
}

/** O placar: todos os contatos marcados como multiplicador, COM os zeros. */
export async function listarMultiplicadores(db: SupabaseClient, orgId: string): Promise<MultiplicadorRow[]> {
  const { data: cts } = await db
    .from("contacts")
    .select("id, name, last_activity_at, tags")
    .eq("organization_id", orgId)
    .contains("tags", [TAG_MULTIPLICADOR]);
  const contatos = (cts ?? []) as {
    id: string;
    name: string | null;
    last_activity_at: string | null;
    tags: string[] | null;
  }[];
  if (contatos.length === 0) return [];

  const { trouxeDe, alcancouDe } = await lerSinais(db, orgId);

  // Quem já recebeu um link pessoal (existe pol_video_shares com ele de sharer).
  const { data: sharesData } = await db
    .from("pol_video_shares")
    .select("sharer_contact_id")
    .eq("organization_id", orgId)
    .in(
      "sharer_contact_id",
      contatos.map((c) => c.id),
    );
  const temLink = new Set(
    ((sharesData ?? []) as { sharer_contact_id: string | null }[])
      .map((s) => s.sharer_contact_id)
      .filter((v): v is string => !!v),
  );

  return contatos
    .map((c) => {
      const trouxe = trouxeDe.get(c.id) ?? 0;
      const alcancou = alcancouDe.get(c.id) ?? 0;
      const tags = ((c.tags ?? []) as string[]).filter((t) => typeof t === "string");
      return {
        contactId: c.id,
        nome: c.name ?? "Sem nome",
        trouxe,
        alcancou,
        ultimaAtividadeISO: c.last_activity_at ?? null,
        compartilhou: alcancou > 0,
        recebeuLink: temLink.has(c.id),
        tipo: (tags.includes(TAG_DIVULGADOR) ? "divulgador" : "assessor") as TipoMultiplicador,
      };
    })
    .sort((a, b) => b.trouxe - a.trouxe || b.alcancou - a.alcancou || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Quem JÁ trouxe/alcançou gente mas NÃO está marcado ainda — pra sugerir "adicionar"
 * num clique (o cliente não marca do zero). Top 10 por relevância.
 */
export async function sugestoesDeMultiplicador(
  db: SupabaseClient,
  orgId: string,
  jaNoCohort: Set<string>,
): Promise<SugestaoMultiplicador[]> {
  const { trouxeDe, alcancouDe } = await lerSinais(db, orgId);
  const ids = new Set<string>([...trouxeDe.keys(), ...alcancouDe.keys()]);
  const candidatos = [...ids].filter((id) => !jaNoCohort.has(id));
  if (candidatos.length === 0) return [];

  const ranked = candidatos
    .map((id) => ({ id, trouxe: trouxeDe.get(id) ?? 0, alcancou: alcancouDe.get(id) ?? 0 }))
    .sort((a, b) => b.trouxe - a.trouxe || b.alcancou - a.alcancou)
    .slice(0, 10);

  const { data: cts } = await db
    .from("contacts")
    .select("id, name")
    .eq("organization_id", orgId)
    .in(
      "id",
      ranked.map((r) => r.id),
    );
  const nomeDe = new Map(((cts ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name]));
  return ranked.map((r) => ({
    contactId: r.id,
    nome: nomeDe.get(r.id) ?? "Sem nome",
    trouxe: r.trouxe,
    alcancou: r.alcancou,
  }));
}

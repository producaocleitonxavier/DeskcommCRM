/**
 * IDENTIDADE DO MANDATO — fonte única de "quem é o político" para TODO texto que
 * o sistema envia (áudio, drip, indicação, retry). Lê `pol_gabinete_config`
 * (1 linha por organização: nome, cargo, cidade...). É o que faz o sistema
 * servir QUALQUER político — nada de nome chumbado no código.
 *
 * Regra de ouro: se a config ainda não foi preenchida, o texto NUNCA inventa um
 * nome — cai num rótulo genérico ("o nosso gabinete"). E as frases prontas são
 * NEUTRAS DE GÊNERO (servem para vereador ou vereadora, deputado ou deputada),
 * por isso evitam o artigo "o/a" antes do nome.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface IdentidadeDoMandato {
  nomeParlamentar: string | null;
  cargo: string | null;
  cidade: string | null;
  primeiroNome: string | null;
}

export async function lerIdentidadeDoMandato(
  db: SupabaseClient,
  organizationId: string,
): Promise<IdentidadeDoMandato> {
  const { data } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, cidade")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const row = data as { nome_parlamentar?: string | null; cargo?: string | null; cidade?: string | null } | null;
  const nome = (row?.nome_parlamentar ?? "").trim() || null;
  return {
    nomeParlamentar: nome,
    cargo: (row?.cargo ?? "").trim() || null,
    cidade: (row?.cidade ?? "").trim() || null,
    primeiroNome: nome ? (nome.split(/\s+/)[0] ?? nome) : null,
  };
}

/** Como o político se apresenta no áudio: "Aqui é Cleiton Xavier." | "Aqui é do gabinete." */
export function comoSeApresentaNaVoz(id: IdentidadeDoMandato): string {
  return id.nomeParlamentar ? `Aqui é ${id.nomeParlamentar}.` : "Aqui é do gabinete.";
}

/** "do gabinete de Cleiton Xavier" | "do nosso gabinete" (neutro de gênero). */
export function gabineteDeLabel(id: IdentidadeDoMandato): string {
  return id.nomeParlamentar ? `do gabinete de ${id.nomeParlamentar}` : "do nosso gabinete";
}

/** "as novidades de Cleiton Xavier" | "as novidades do gabinete". */
export function novidadesDeLabel(id: IdentidadeDoMandato): string {
  return id.nomeParlamentar ? `as novidades de ${id.nomeParlamentar}` : "as novidades do gabinete";
}

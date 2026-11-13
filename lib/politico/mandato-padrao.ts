/**
 * O MANDATO COMO PONTO DE PARTIDA das telas de inteligência.
 *
 * Dossiê, Cadeiras, Comparar, Narrativas e Por zona abriam vazias, pedindo
 * eleição, município e candidato — que o gabinete já informou uma vez, em
 * Configurar mandato. Aqui sai essa escolha pronta: a eleição e o candidato do
 * mandato, e o município da cidade do gabinete (quando ele existe na base).
 *
 * Só leitura, escopada à organização da sessão. Sem mandato configurado devolve
 * `null`, e as telas abrem como antes (pedindo a escolha).
 */
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export interface MandatoPadrao {
  electionId: number;
  /** Identificador do candidato do mandato na base eleitoral. */
  sq: string;
  nome: string;
  /** Código do município da cidade do gabinete; `null` se não deu para casar. */
  municipioTse: string | null;
}

/** Compara nomes de cidade sem acento, caixa ou UF ("Belo Horizonte - MG" = "BELO HORIZONTE"). */
export function chaveDaCidade(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*[-/,]\s*[A-Za-z]{2}\s*$/, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

/** O código do município cujo nome casa com a cidade do gabinete. */
export function municipioDaCidade(
  cidade: string | null | undefined,
  municipios: readonly { tse: string; nome: string }[],
): string | null {
  const alvo = chaveDaCidade(cidade);
  if (!alvo) return null;
  return municipios.find((m) => chaveDaCidade(m.nome) === alvo)?.tse ?? null;
}

export async function obterMandatoPadrao(
  municipios: readonly { tse: string; nome: string }[],
): Promise<MandatoPadrao | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const db = await createClient();
  const { data } = await db
    .from("pol_gabinete_config")
    .select("tse_election_id, tse_sq_candidato, tse_candidato_nome, cidade")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const c = data as {
    tse_election_id?: number | null;
    tse_sq_candidato?: number | null;
    tse_candidato_nome?: string | null;
    cidade?: string | null;
  } | null;
  if (!c?.tse_election_id || !c?.tse_sq_candidato) return null;
  return {
    electionId: Number(c.tse_election_id),
    sq: String(c.tse_sq_candidato),
    nome: c.tse_candidato_nome ?? "",
    municipioTse: municipioDaCidade(c.cidade, municipios),
  };
}

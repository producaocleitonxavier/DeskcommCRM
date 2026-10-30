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

// ── Abrangência do mandato (escopo geográfico da Inteligência) ────────────────
// A ferramenta se adapta ao TIPO de político escolhido na Identidade do Mandato:
// vereador/prefeito = MUNICIPAL (cidade + bairros); deputado estadual = ESTADUAL
// (o estado); deputado federal/senador = NACIONAL (Brasil, enxuto). Derivamos do
// campo `cargo` (texto livre) — a mesma escolha que a equipe já faz no cadastro.
export type AbrangenciaMandato = "municipal" | "estadual" | "nacional";

export function abrangenciaDoMandato(cargo: string | null | undefined): AbrangenciaMandato {
  const c = (cargo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/federal|senad|presiden/.test(c)) return "nacional";
  if (/estadual|distrital|governad|deputad(?!.*federal)/.test(c)) return "estadual";
  // vereador, prefeito, vice-prefeito, e qualquer coisa não reconhecida → municipal
  return "municipal";
}

export interface EscopoDaInteligencia {
  abrangencia: AbrangenciaMandato;
  // Rótulo do recorte ("Belo Horizonte", "Minas Gerais", "Brasil").
  lugar: string;
  // Como a IA deve chamar a unidade de território analisada.
  unidadeTerritorio: string; // "bairro" | "município" | "estado"
  // Frase curta pra cabeçalho.
  rotulo: string; // "Inteligência municipal — Belo Horizonte"
}

/** Resolve o escopo geográfico da Inteligência a partir da identidade do mandato. */
export function escopoDaInteligencia(id: IdentidadeDoMandato, uf?: string | null): EscopoDaInteligencia {
  const abrangencia = abrangenciaDoMandato(id.cargo);
  const estado = (uf ?? "").trim().toUpperCase() || null;
  if (abrangencia === "nacional") {
    return { abrangencia, lugar: "Brasil", unidadeTerritorio: "estado", rotulo: "Inteligência nacional — Brasil" };
  }
  if (abrangencia === "estadual") {
    const lugar = estado ? `estado (${estado})` : "seu estado";
    return { abrangencia, lugar, unidadeTerritorio: "município", rotulo: `Inteligência estadual — ${estado ?? "seu estado"}` };
  }
  const lugar = id.cidade?.trim() || "seu município";
  return { abrangencia, lugar, unidadeTerritorio: "bairro", rotulo: `Inteligência municipal — ${lugar}` };
}

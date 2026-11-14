/**
 * Lê a identidade do gabinete para as duas regras de `adendo-do-agente.ts`.
 *
 * Rodam dentro do turno do agente: NUNCA lançam e nunca derrubam a resposta por erro —
 * organização sem gabinete (clínica, loja), tabela ausente numa instalação antiga ou
 * falha de leitura devolvem vazio e o turno segue como sempre foi.
 */
import type { Queryable } from "@/lib/agent-engine/queue/queue";

import { adendoDoGabinete, apresentacaoDaIA, type IdentidadeDoGabinete } from "./adendo-do-agente";

/** A identidade do gabinete da organização, ou `null` quando ela não é um gabinete. */
export async function identidadeDoGabineteDaOrg(db: Queryable, org: string): Promise<IdentidadeDoGabinete | null> {
  try {
    const { rows } = await db.query<{ nome_parlamentar: string | null; cargo: string | null }>(
      "select nome_parlamentar, cargo from pol_gabinete_config where organization_id = $1 limit 1",
      [org],
    );
    const linha = rows[0];
    return linha ? { nomeParlamentar: linha.nome_parlamentar, cargo: linha.cargo } : null;
  } catch {
    return null;
  }
}

/** O trecho fixo somado ao prompt do agente; "" fora de gabinete. */
export async function adendoDoGabineteDaOrg(db: Queryable, org: string): Promise<string> {
  return (await identidadeDoGabineteDaOrg(db, org)) ? adendoDoGabinete() : "";
}

/** A frase com que a IA se apresenta na primeira mensagem; `null` fora de gabinete. */
export async function apresentacaoDaIADaOrg(db: Queryable, org: string): Promise<string | null> {
  const g = await identidadeDoGabineteDaOrg(db, org);
  return g ? apresentacaoDaIA(g) : null;
}

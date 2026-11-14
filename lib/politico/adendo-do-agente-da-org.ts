/**
 * Lê a identidade do gabinete e devolve o adendo do agente (ver `adendo-do-agente.ts`).
 *
 * Roda dentro do turno do agente: NUNCA lança e nunca atrasa a resposta por erro —
 * organização sem gabinete (clínica, loja), tabela ausente numa instalação antiga ou
 * falha de leitura devolvem "" e o turno segue como sempre foi.
 */
import type { Queryable } from "@/lib/agent-engine/queue/queue";

import { adendoDoGabinete } from "./adendo-do-agente";

export async function adendoDoGabineteDaOrg(db: Queryable, org: string): Promise<string> {
  try {
    const { rows } = await db.query<{ nome_parlamentar: string | null; cargo: string | null }>(
      "select nome_parlamentar, cargo from pol_gabinete_config where organization_id = $1 limit 1",
      [org],
    );
    const linha = rows[0];
    if (!linha) return "";
    return adendoDoGabinete({ nomeParlamentar: linha.nome_parlamentar, cargo: linha.cargo });
  } catch {
    return "";
  }
}

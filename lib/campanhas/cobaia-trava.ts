/**
 * TRAVA DE COBAIA (laboratório do teste em escala) — migration 9090
 * (`pol_cobaia_controle` + `pol_cobaia_semente`).
 *
 * Módulo ENXUTO de propósito: só depende de um `SupabaseClient` e do `logger`.
 * Assim a mesma trava roda tanto no motor de campanha (`./rodada`) quanto no
 * PONTO ÚNICO DE ENVIO (`app/api/v1/messages/_handler.ts`) sem puxar o grafo
 * pesado da campanha. A linha vermelha — zero envio a eleitor real no
 * laboratório — precisa valer em TODO caminho de envio (avisos, multiplicadores,
 * voz, campanha, agente), não só na campanha.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export interface TravaDeCobaia {
  cobaia: boolean;
  pausado: boolean;
  sementes: Set<string>;
}

/**
 * A TRAVA DE COBAIA de uma org: é laboratório? está pausada? quais telefones
 * podem receber? (migration 9090).
 *
 * Org REAL (de cliente) não tem linha em `pol_cobaia_controle` → devolve
 * `{cobaia:false, pausado:false}` e NADA é restringido pela leitura do banco.
 * A trava de banco só morde o laboratório do teste em escala.
 *
 * ═══ Duas falhas DE PROPÓSITO diferentes ═══
 *
 * · Erro ao ler o CONTROLE → falha-ABERTA como org normal. Um erro transitório
 *   não pode parar a campanha de um cliente que nem é cobaia; e "não sei" só pode
 *   virar "não restringe" porque a org real nunca é laboratório.
 * · Org É cobaia mas erro ao ler as SEMENTES → falha-FECHADA: conjunto vazio,
 *   nenhum destino casa, TODO envio recusado. No laboratório, segurança vence
 *   liveness — melhor não mandar do que mandar para fora da allowlist.
 *
 * A falha-ABERTA do controle é coberta, em profundidade, pela lista de org-ids
 * em `COBAIA_ORG_IDS` (ver `checarEnvioCobaia`): uma org listada ali é laboratório
 * mesmo que a linha do banco suma ou a leitura falhe.
 */
export async function travaDeCobaia(
  admin: SupabaseClient,
  organizationId: string,
): Promise<TravaDeCobaia> {
  const semRestricao: TravaDeCobaia = { cobaia: false, pausado: false, sementes: new Set() };
  const { data: ctrl, error: erroCtrl } = await admin
    .from("pol_cobaia_controle")
    .select("modo_cobaia, envio_pausado")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (erroCtrl) {
    logger.warn("[cobaia] leitura do controle falhou; tratando como org normal", {
      motivo: erroCtrl.message,
    });
    return semRestricao;
  }
  if (!ctrl) return semRestricao; // org normal: sem linha, sem restrição
  const linha = ctrl as { modo_cobaia?: boolean; envio_pausado?: boolean };
  const pausado = !!linha.envio_pausado;
  const cobaia = linha.modo_cobaia !== false; // default true
  if (!cobaia) return { cobaia: false, pausado, sementes: new Set() };

  const { data: sem, error: erroSem } = await admin
    .from("pol_cobaia_semente")
    .select("telefone")
    .eq("organization_id", organizationId);
  if (erroSem) {
    logger.error("[cobaia] org cobaia e a leitura das sementes falhou; travando o envio (falha-fechada)", {
      motivo: erroSem.message,
    });
    return { cobaia: true, pausado, sementes: new Set() };
  }
  return {
    cobaia: true,
    pausado,
    sementes: new Set((sem ?? []).map((s) => soDigitos((s as { telefone: string }).telefone))),
  };
}

/** Só os dígitos de um telefone — a comparação da allowlist ignora +55, espaços e traços. */
export function soDigitos(telefone: string | null | undefined): string {
  return (telefone ?? "").replace(/\D/g, "");
}

/**
 * Org-ids forçadas a laboratório pela variável de ambiente `COBAIA_ORG_IDS`
 * (ids separados por vírgula). DEFESA EM PROFUNDIDADE: mesmo que a linha em
 * `pol_cobaia_controle` suma, seja apagada por engano, ou a leitura do controle
 * falhe (falha-ABERTA), uma org listada aqui continua tratada como cobaia e só
 * envia para a allowlist-semente. Fecha a falha "sem linha no banco = org real".
 */
export function orgsDeCobaiaDoAmbiente(): Set<string> {
  return new Set(
    (process.env.COBAIA_ORG_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Decide se um envio a `destino` deve ser BLOQUEADO por ser uma org-cobaia.
 * Chamado no PONTO ÚNICO de envio, para TODO remetente (inclusive humano).
 * Fail-closed: numa cobaia só passa quem está na allowlist-semente; fora da
 * cobaia (org real, não listada no env) é no-op.
 *
 * Uma org é cobaia se tem a trava no banco OU está em `COBAIA_ORG_IDS`. Quando
 * só o env a marca (sem linha no banco), as sementes vêm vazias → bloqueia tudo
 * (fail-closed), que é a posição mais segura para um laboratório mal-configurado.
 */
export async function checarEnvioCobaia(
  db: SupabaseClient,
  organizationId: string,
  destino: string,
): Promise<{ bloqueado: boolean; motivo?: string }> {
  const forcadoPorEnv = orgsDeCobaiaDoAmbiente().has(organizationId);
  const trava = await travaDeCobaia(db, organizationId);
  const ehCobaia = trava.cobaia || forcadoPorEnv;
  if (!ehCobaia) return { bloqueado: false };
  if (trava.pausado) return { bloqueado: true, motivo: "cobaia:envio_pausado" };
  if (!trava.sementes.has(soDigitos(destino))) {
    return { bloqueado: true, motivo: "cobaia:destino_fora_da_allowlist" };
  }
  return { bloqueado: false };
}

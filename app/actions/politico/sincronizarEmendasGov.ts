"use server";

/**
 * Sincroniza as EMENDAS do parlamentar a partir do Portal da Transparência
 * (execução real: empenhado/liquidado/pago) para `pol_emendas`. Sem duplicar:
 * casa por (org, numero, ano) — atualiza os valores se já existe, insere se não.
 * Só faz sentido para DEPUTADO FEDERAL; vereador municipal volta 0 (sem emenda
 * federal) — e isso é ok. Gate ADMIN.
 */
import { revalidatePath } from "next/cache";

import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarEmendasGov } from "@/lib/politico/gov-emendas";

export type ResultadoSync =
  | { ok: true; total: number; inseridas: number; atualizadas: number; semToken?: boolean; semNome?: boolean }
  | { ok: false; error: string };

export async function sincronizarEmendasGov(): Promise<ResultadoSync> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, tse_candidato_nome")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const c = cfg as { nome_parlamentar: string | null; tse_candidato_nome: string | null } | null;
  const nome = (c?.nome_parlamentar ?? c?.tse_candidato_nome ?? "").trim();
  if (!nome) return { ok: true, total: 0, inseridas: 0, atualizadas: 0, semNome: true };

  const agora = new Date().getFullYear();
  const anos = [agora, agora - 1, agora - 2];

  let emendas;
  try {
    emendas = await buscarEmendasGov(nome, anos);
  } catch {
    return { ok: false, error: "falha_na_api" };
  }
  // Sem token o lib volta []; sinaliza para a tela orientar o admin.
  if (!process.env.PORTAL_TRANSPARENCIA_TOKEN) {
    return { ok: true, total: 0, inseridas: 0, atualizadas: 0, semToken: true };
  }

  let inseridas = 0;
  let atualizadas = 0;
  for (const e of emendas) {
    if (!e.numero || !e.ano) continue;
    const valores = {
      valor_empenhado_cents: e.empenhadoCents,
      valor_liquidado_cents: e.liquidadoCents,
      valor_pago_cents: e.pagoCents,
      valor_indicado_cents: e.empenhadoCents,
    };
    const { data: existente } = await admin
      .from("pol_emendas")
      .select("id")
      .eq("organization_id", org.orgId)
      .eq("numero", e.numero)
      .eq("ano", e.ano)
      .limit(1);
    const achou = (existente ?? [])[0] as { id: string } | undefined;
    if (achou) {
      await admin.from("pol_emendas").update({ ...valores, updated_at: new Date().toISOString() }).eq("id", achou.id).eq("organization_id", org.orgId);
      atualizadas++;
    } else {
      // tipo e area_tematica têm CHECK com enum fixo em pol_emendas — deixamos no
      // default e guardamos o detalhe real (função/tipo da emenda) no texto.
      const detalhe = [e.tipo, e.funcao && `Função: ${e.funcao}`].filter(Boolean).join(" · ");
      await admin.from("pol_emendas").insert({
        organization_id: org.orgId,
        numero: e.numero,
        ano: e.ano,
        esfera: "federal",
        municipio: e.localidade,
        objeto: e.subfuncao ?? e.funcao,
        descricao: `Importada do Portal da Transparência (Governo Federal).${detalhe ? " " + detalhe + "." : ""}`,
        ...valores,
      });
      inseridas++;
    }
  }

  revalidatePath("/app/politico/emendas");
  revalidatePath("/app/politico/prestacao-contas");
  return { ok: true, total: emendas.length, inseridas, atualizadas };
}

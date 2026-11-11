"use server";

/**
 * Sincroniza as EMENDAS ESTADUAIS do parlamentar a partir do CSV oficial da ALMG
 * (Assembleia Legislativa de MG) para `pol_emendas` (esfera 'estadual'). Casa por
 * (org, numero, ano) — atualiza valores/status se já existe, insere se não.
 * Só faz sentido para DEPUTADO ESTADUAL de MG; vereador municipal / deputado
 * federal volta 0 (o nome não está na base estadual) — e isso é ok. Gate ADMIN.
 */
import { revalidatePath } from "next/cache";

import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarEmendasAlmg, statusAlmgPorExecucao } from "@/lib/politico/gov-emendas-almg";
import { funcaoParaArea } from "@/lib/politico/gov-funcao-area";

export type ResultadoSyncAlmg =
  | { ok: true; total: number; inseridas: number; atualizadas: number; semNome?: boolean }
  | { ok: false; error: string };

export async function sincronizarEmendasAlmg(): Promise<ResultadoSyncAlmg> {
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

  let emendas;
  try {
    emendas = await buscarEmendasAlmg(nome);
  } catch {
    return { ok: false, error: "falha_na_fonte" };
  }

  let inseridas = 0;
  let atualizadas = 0;
  for (const e of emendas) {
    if (!e.numero || !e.ano) continue;
    const valores = {
      valor_indicado_cents: e.indicadoCents,
      valor_empenhado_cents: e.empenhadoCents,
      valor_liquidado_cents: e.utilizadoCents,
      valor_pago_cents: e.pagoCents,
      area_tematica: funcaoParaArea(e.funcao),
      status: statusAlmgPorExecucao(e),
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
      await admin
        .from("pol_emendas")
        .update({ ...valores, updated_at: new Date().toISOString() })
        .eq("id", achou.id)
        .eq("organization_id", org.orgId);
      atualizadas++;
    } else {
      // Beneficiário + função viram o detalhe textual (tipo tem CHECK de enum
      // fixo que não casa com o texto da ALMG; fica no default).
      const detalhe = [
        e.beneficiario && `Beneficiário: ${e.beneficiario}`,
        e.funcao && `Função: ${e.funcao}`,
      ]
        .filter(Boolean)
        .join(" · ");
      await admin.from("pol_emendas").insert({
        organization_id: org.orgId,
        numero: e.numero,
        ano: e.ano,
        esfera: "estadual",
        municipio: e.municipio,
        objeto: e.acao ?? e.descricao ?? e.funcao,
        descricao: `Importada da ALMG (Assembleia Legislativa de MG).${detalhe ? " " + detalhe + "." : ""}`,
        ...valores,
      });
      inseridas++;
    }
  }

  revalidatePath("/app/politico/emendas");
  revalidatePath("/app/politico/prestacao-contas");
  return { ok: true, total: emendas.length, inseridas, atualizadas };
}

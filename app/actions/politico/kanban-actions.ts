"use server";

/**
 * Ação do quadro de MOBILIZAÇÃO (kanban): mover uma pessoa de etapa do funil à
 * MÃO (override do operador). Diferente do motor de engajamento (que só AVANÇA
 * sozinho por score), aqui o operador pode mover pra frente E pra trás — ele
 * conhece a pessoa. Registra a transição (`pol_funnel_transitions`, mesma tabela
 * do funil) e deixa o `political_score` coerente com a etapa, pra o motor não
 * puxar de volta no próximo engajamento.
 *
 * Como o resto do político: o browser não vê a sessão → tudo no servidor, com o
 * client autenticado (RLS libera só a org). `organization_id` vem de
 * resolveActiveOrg, nunca do input.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type AcaoResultado = { ok: true } | { ok: false; erro: string };

const ETAPAS = ["novo_cadastro", "simpatizante", "apoiador", "militante", "voto_certo"] as const;
type Etapa = (typeof ETAPAS)[number];

/** Piso de score coerente com cada etapa (espelha LIMIAR_ESTAGIO do engajamento). */
const SCORE_DA_ETAPA: Record<Etapa, number> = {
  novo_cadastro: 0,
  simpatizante: 5,
  apoiador: 20,
  militante: 50,
  voto_certo: 100,
};

export async function moverEtapa(contactId: string, etapa: string): Promise<AcaoResultado> {
  const cid = (contactId ?? "").trim();
  if (!cid) return { ok: false, erro: "Contato inválido." };
  if (!ETAPAS.includes(etapa as Etapa)) return { ok: false, erro: "Etapa inválida." };
  const alvo = etapa as Etapa;

  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data: lead, error: erroLead } = await db
    .from("pol_leads")
    .select("id, support_level, political_score")
    .eq("organization_id", org.orgId)
    .eq("contact_id", cid)
    .maybeSingle();
  if (erroLead) return { ok: false, erro: erroLead.message };
  if (!lead) return { ok: false, erro: "Essa pessoa não está no funil." };

  const atual = (lead as { support_level: string }).support_level;
  if (atual === alvo) return { ok: true };

  // Registra a transição (mesma tabela do funil — aparece em "transições recentes").
  const { error: erroT } = await db.from("pol_funnel_transitions").insert({
    organization_id: org.orgId,
    contact_id: cid,
    from_stage: atual,
    to_stage: alvo,
    changed_by: user.id,
    reason: "Movido à mão no quadro de Mobilização",
  });
  if (erroT) return { ok: false, erro: erroT.message };

  // Score coerente: só sobe o piso (não rebaixa um score real alto ao mover p/
  // uma etapa — mas garante o mínimo da etapa alvo pra o motor não reverter).
  const scoreAtual = Number((lead as { political_score: number }).political_score) || 0;
  const scoreAlvo = Math.max(scoreAtual, SCORE_DA_ETAPA[alvo]);

  const { error: erroUpd } = await db
    .from("pol_leads")
    .update({ support_level: alvo, political_score: scoreAlvo, updated_at: new Date().toISOString() })
    .eq("id", (lead as { id: string }).id)
    .eq("organization_id", org.orgId);
  if (erroUpd) return { ok: false, erro: erroUpd.message };

  revalidatePath("/app/politico/kanban");
  return { ok: true };
}

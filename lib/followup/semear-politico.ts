/**
 * NICHO DA ORG + PRÉ-SEMEADURA DOS FOLLOW-UPS DO GABINETE.
 *
 * Duas coisas que a tela de Follow-ups precisa de um gabinete e que o motor
 * genérico (nascido para clínica) não sabe sozinho:
 *
 *   1. **Qual nicho é esta org?** O catálogo de modelos é plural (clínica +
 *      político). Mostrar "Exame", "Cobrança do devedor" ou "carrinho
 *      abandonado" para quem opera um gabinete quebra a confiança na primeira
 *      tela. O sinal honesto de "esta org é um gabinete" é ter `pol_gabinete_config`
 *      — a linha de identidade do mandato, que só existe depois de configurar o
 *      gabinete. Sem ela, cai no nicho clínica (comportamento de origem).
 *
 *   2. **Chegar configurado.** Um gabinete novo abre Follow-ups e vê a tela
 *      vazia — e quem opera (a recepção do gabinete) não vai desenhar nó, ramo e
 *      prazo de graça na primeira semana. Então semeamos os TRÊS follow-ups do
 *      gabinete como RASCUNHO: a pessoa só revisa o texto e publica, não monta do
 *      zero. Igual à rota de instalação (`from-model`), mas sem um clique por
 *      modelo — e, como lá, NÃO publica e NÃO arma agente nenhum (nada sai
 *      sozinho até uma pessoa decidir).
 *
 * Idempotente por construção: `ignoreDuplicates` na constraint
 * `unique (organization_id, name)` nunca sobrescreve um fluxo que a recepção já
 * editou, e o flag `pol_followups_semeados` (em `organizations.settings`) evita
 * ressuscitar o que ela apagou de propósito. Best-effort: a semeadura NUNCA
 * derruba a página — se falhar, a tela só volta a mostrar "Começar de um modelo".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { triggerConfigSchema } from "@/lib/followup/api-schemas";
import { MODELOS_DE_POLITICO } from "@/lib/followup/modelos/politico";
import type { NichoDeModelo } from "@/lib/followup/modelos/tipos";

/** Uma org é "político" (gabinete) quando tem a identidade do mandato gravada
 * (`pol_gabinete_config`). Sem isso, o nicho é clínica — o padrão de origem. */
export async function nichoDaOrg(db: SupabaseClient, orgId: string): Promise<NichoDeModelo> {
  const { data } = await db
    .from("pol_gabinete_config")
    .select("organization_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  return data ? "politico" : "clinica";
}

/** O que seria inserido em `followup_flow_pointers` para os 3 modelos do
 * gabinete — espelha exatamente o INSERT da rota `from-model`. PURO (sem banco)
 * para ser testável: a montagem do ponteiro não pode divergir da rota em
 * silêncio. `gatilho({})` porque nenhum modelo político pede etapa. */
export function linhasDeModelosPoliticos(orgId: string) {
  return MODELOS_DE_POLITICO.map((m) => ({
    organization_id: orgId,
    name: m.nome,
    draft_graph: m.grafo,
    trigger_config: triggerConfigSchema.parse(m.gatilho({})),
    handoff_policy: m.handoffPolicy,
  }));
}

/** Semeia os 3 follow-ups do gabinete como rascunho. Idempotente e best-effort:
 * nunca lança (a página não cai), nunca sobrescreve fluxo editado. */
export async function semearModelosPoliticos(db: SupabaseClient, orgId: string): Promise<void> {
  try {
    await db
      .from("followup_flow_pointers")
      .upsert(linhasDeModelosPoliticos(orgId), {
        onConflict: "organization_id,name",
        ignoreDuplicates: true,
      });
  } catch {
    /* best-effort: o seed é conforto de onboarding, não pode derrubar a tela. */
  }
}

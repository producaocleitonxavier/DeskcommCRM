"use server";

/**
 * Autoria "à prova de criança" de um follow-up do gabinete: a pessoa escreve só
 * as MENSAGENS e os PRAZOS ("manda isso, espera 3 dias, manda aquilo"), e a
 * `montarEscada` gera o grafo válido por baixo — sem nó, ramo nem prazo de graça
 * à vista. Nasce RASCUNHO (ninguém recebe nada até uma pessoa publicar), igual
 * aos modelos pré-semeados.
 *
 * O desenho da jornada (o "ver o que vai acontecer") é puro e roda no cliente
 * (`lib/followup/escada-jornada.ts`); aqui é só a GRAVAÇÃO.
 */
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerConfigSchema } from "@/lib/followup/api-schemas";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { montarEscada, type EscadaSpec } from "@/lib/followup/modelos/escada";

const DIA_MS = 86_400_000;

const toqueSchema = z.object({
  texto: z.string().trim().min(1).max(900),
  esperaDias: z.number().int().min(0).max(90),
  rotulo: z.string().trim().max(60).optional(),
});

const payloadSchema = z.object({
  nome: z.string().trim().min(3).max(80),
  gatilho: z.enum(["lead_created", "manual"]),
  toques: z.array(toqueSchema).min(1).max(5),
});

export type ResultadoFollowupSimples =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function criarFollowupSimples(entrada: unknown): Promise<ResultadoFollowupSimples> {
  const parsed = payloadSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Confira os campos: nome e ao menos uma mensagem." };
  const d = parsed.data;

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  if (supportWriteError(user.support)) return { ok: false, error: "Sem permissão." };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "Organização não encontrada." };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, error: "Só um gestor pode criar fluxos." };
  if (await mfaEmDivida()) return { ok: false, error: "Verificação de 2 fatores pendente." };

  // Monta a escada a partir das mensagens+prazos. Prazo de resposta e ramo "sim"
  // ficam em defaults sãos — a pessoa não precisa pensar nisso.
  const spec: EscadaSpec = {
    prazoDeRespostaMs: 3 * DIA_MS,
    sim: { rotulo: "Respondeu que sim", padrao: "sim" },
    notaDeResposta: "A pessoa respondeu — quem segue a conversa é o atendimento do gabinete.",
    toques: d.toques.map((t, i) => ({
      // Espera só quando há dias a esperar (um "espera 0" quebraria o piso do nó).
      ...(t.esperaDias > 0 ? { esperaAntesMs: t.esperaDias * DIA_MS } : {}),
      texto: t.texto,
      rotulo: t.rotulo?.trim() || `Mensagem ${i + 1}`,
    })),
  };

  let draftGraph: unknown;
  let triggerConfig: unknown;
  try {
    draftGraph = flowGraphSchema.parse(montarEscada(spec));
    triggerConfig = triggerConfigSchema.parse({ kind: d.gatilho, cancel_on_reply: true });
  } catch {
    return { ok: false, error: "Não consegui montar o fluxo com esses dados. Tente mensagens mais curtas." };
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("followup_flow_pointers")
    .insert({
      organization_id: org.orgId,
      name: d.nome,
      status: "draft",
      draft_graph: draftGraph,
      trigger_config: triggerConfig,
      handoff_policy: "pause",
    })
    .select("id")
    .single();

  if (error || !row) {
    if (error?.code === "23505") {
      return { ok: false, error: `Já existe um fluxo chamado "${d.nome}". Escolha outro nome.` };
    }
    return { ok: false, error: "Não foi possível salvar o fluxo." };
  }

  const id = (row as { id: string }).id;
  void audit({
    action: "followup_flow.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "followup_flow",
    resourceId: id,
    metadata: { source: "escada_simples", toques: d.toques.length, gatilho: d.gatilho },
  });

  return { ok: true, id };
}

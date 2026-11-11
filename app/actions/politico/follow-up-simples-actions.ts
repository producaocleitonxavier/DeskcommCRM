"use server";

/**
 * Autoria de follow-up GUIADA POR OBJETIVO — o jeito de um gabinete montar algo
 * assertivo em 1 minuto, sem entender "nó", "ramo" nem "escada".
 *
 * A pessoa escolhe O QUE QUER FAZER; o fluxo certo já vem montado por baixo:
 *   • acolher  → manda uma mensagem (+ lembrete opcional p/ quem não responde)
 *   • conteudo → PERGUNTA; se responder SIM, MANDA o material; senão, lembrete → para
 *   • cobrar   → manda uma mensagem (+ lembrete opcional)
 *   • lembrar  → manda uma mensagem (+ lembrete opcional)
 *
 * Nasce RASCUNHO (ninguém recebe nada até uma pessoa publicar). A jornada é pura
 * e roda no cliente; aqui é só a GRAVAÇÃO.
 */
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerConfigSchema } from "@/lib/followup/api-schemas";
import { flowGraphSchema, type FlowGraph } from "@/lib/followup/graph-schema";
import { montarEscada } from "@/lib/followup/modelos/escada";
import { montarPerguntaResposta } from "@/lib/followup/modelos/pergunta-resposta";

const DIA_MS = 86_400_000;
const PRAZO_RESPOSTA_MS = 3 * DIA_MS;
const NOTA_RESPONDEU = "A pessoa respondeu — quem segue a conversa é o atendimento do gabinete.";

const lembreteSchema = z.object({
  esperaDias: z.number().int().min(1).max(90),
  texto: z.string().trim().min(1).max(900),
});

const payloadSchema = z.object({
  objetivo: z.enum(["acolher", "conteudo", "cobrar", "lembrar"]),
  nome: z.string().trim().min(3).max(80),
  mensagem: z.string().trim().min(1).max(900),
  /** Só no objetivo "conteudo": o que o fluxo manda quando a pessoa responde sim. */
  material: z.string().trim().max(900).optional(),
  /** Lembrete opcional para quem não respondeu. */
  lembrete: lembreteSchema.optional(),
});

export type ResultadoFollowupSimples = { ok: true; id: string } | { ok: false; error: string };

/** O gatilho em termos simples: "quando chega" × "quando eu inscrever". */
function gatilhoDoObjetivo(objetivo: string) {
  const kind = objetivo === "acolher" || objetivo === "conteudo" ? "lead_created" : "manual";
  return { kind, cancel_on_reply: true } as const;
}

function montarGrafo(d: z.infer<typeof payloadSchema>): FlowGraph {
  if (d.objetivo === "conteudo") {
    return montarPerguntaResposta({
      pergunta: { rotulo: "Oferece o conteúdo", texto: d.mensagem },
      simPadrao: "sim",
      simRotulo: "Quer receber",
      material: { rotulo: "Manda o material", texto: d.material ?? "" },
      prazoDeRespostaMs: PRAZO_RESPOSTA_MS,
      lembrete: d.lembrete
        ? { esperaAntesMs: d.lembrete.esperaDias * DIA_MS, rotulo: "Lembrete", texto: d.lembrete.texto }
        : undefined,
      notaDeResposta: NOTA_RESPONDEU,
    });
  }
  // acolher / cobrar / lembrar → escada: mensagem (+ lembrete opcional).
  return montarEscada({
    prazoDeRespostaMs: PRAZO_RESPOSTA_MS,
    sim: { rotulo: "Respondeu que sim", padrao: "sim" },
    notaDeResposta: NOTA_RESPONDEU,
    toques: [
      { texto: d.mensagem, rotulo: "Mensagem" },
      ...(d.lembrete ? [{ esperaAntesMs: d.lembrete.esperaDias * DIA_MS, texto: d.lembrete.texto, rotulo: "Lembrete" }] : []),
    ],
  });
}

export async function criarFollowupSimples(entrada: unknown): Promise<ResultadoFollowupSimples> {
  const parsed = payloadSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "Confira os campos: nome e a mensagem são obrigatórios." };
  const d = parsed.data;
  if (d.objetivo === "conteudo" && !d.material?.trim()) {
    return { ok: false, error: "Escreva o que você vai mandar quando a pessoa responder sim (o conteúdo/o link)." };
  }

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  if (supportWriteError(user.support)) return { ok: false, error: "Sem permissão." };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "Organização não encontrada." };
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) return { ok: false, error: "Só um gestor pode criar fluxos." };
  if (await mfaEmDivida()) return { ok: false, error: "Verificação de 2 fatores pendente." };

  let draftGraph: unknown;
  let triggerConfig: unknown;
  try {
    draftGraph = flowGraphSchema.parse(montarGrafo(d));
    triggerConfig = triggerConfigSchema.parse(gatilhoDoObjetivo(d.objetivo));
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
    if (error?.code === "23505") return { ok: false, error: `Já existe um fluxo chamado "${d.nome}". Escolha outro nome.` };
    return { ok: false, error: "Não foi possível salvar o fluxo." };
  }

  const id = (row as { id: string }).id;
  void audit({
    action: "followup_flow.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "followup_flow",
    resourceId: id,
    metadata: { source: "guiado_por_objetivo", objetivo: d.objetivo, tem_lembrete: Boolean(d.lembrete) },
  });

  return { ok: true, id };
}

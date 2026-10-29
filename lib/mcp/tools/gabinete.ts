/**
 * Handlers das tools do GABINETE (pacote "Atender o cidadão").
 *
 * `crm_registrar_demanda` — a IA abre uma demanda do gabinete a partir do que o
 * cidadão relatou na conversa (o salto de "conversa" para "resolve").
 * `crm_listar_demandas_cidadao` — a IA consulta o que o cidadão já pediu, pra
 * não duplicar e pra saber o histórico.
 *
 * O texto das `description` AQUI é o que o MODELO lê — por isso carrega a
 * vivência de gabinete (o que é demanda, o que capturar, e o que NÃO fazer:
 * nunca prometer/encaminhar, só registrar). O texto do humano fica no catálogo
 * (`lib/mcp/tools/catalogo/gabinete.ts`).
 *
 * `ctx.supabase` é service-role: filtrar `organization_id` em TODA query. O
 * cidadão é o `ctx.contatoDoTurno` (contato de confiança do turno) — o modelo
 * não escolhe de quem é a demanda.
 */
import { z } from "zod";

import type { McpToolDefinition } from "../types";

const TIPOS_DEMANDA = [
  "servico_publico",
  "infraestrutura",
  "saude",
  "educacao",
  "seguranca",
  "assistencia_social",
  "meio_ambiente",
  "documentacao",
  "outro",
] as const;

const PRIORIDADES = ["baixa", "normal", "alta", "urgente"] as const;

const registrarInput = {
  assunto: z
    .string()
    .min(4)
    .max(400)
    .describe("O que o cidadão pediu, em uma frase clara. Ex.: 'Falta de iluminação na Rua X, bairro Y'."),
  tipo: z.enum(TIPOS_DEMANDA).optional().describe("Tipo da demanda, se der para inferir do relato."),
  prioridade: z.enum(PRIORIDADES).optional().describe("Prioridade; use 'urgente' só se houver risco à segurança/saúde."),
  logradouro: z.string().max(200).optional().describe("Rua/Avenida do problema, se o cidadão disser."),
  numero: z.string().max(40).optional().describe("Número do endereço do problema (aceita 's/n')."),
  bairro: z.string().max(120).optional().describe("Bairro do problema."),
  municipio: z.string().max(120).optional().describe("Cidade do problema."),
  contact_id: z
    .string()
    .uuid()
    .optional()
    .describe("Normalmente vazio — o cidadão da conversa é usado automaticamente."),
};

export const crmRegistrarDemanda: McpToolDefinition<typeof registrarInput> = {
  name: "crm_registrar_demanda",
  description:
    "Registra uma DEMANDA do gabinete quando o cidadão relata um problema ou pedido na conversa (ex.: buraco na rua, " +
    "falta de iluminação, poda de árvore, pedido de serviço público, denúncia). Antes de registrar, use " +
    "crm_listar_demandas_cidadao para não duplicar. Capture o 'assunto' (o que ele quer, em uma frase), o 'tipo' e, se " +
    "o cidadão disser, o endereço do problema (logradouro, número, bairro, município). NÃO prometa resolver, NÃO dê " +
    "prazo e NÃO diga que já encaminhou — apenas registre; quem encaminha ao órgão competente é o gabinete. Depois de " +
    "registrar, confirme ao cidadão que o pedido foi ANOTADO e que o gabinete vai acompanhar.",
  inputSchema: registrarInput,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const contactId = ctx.contatoDoTurno ?? input.contact_id ?? null;
    if (!contactId) {
      return { erro_de_ensino: "Não há cidadão vinculado à conversa para registrar a demanda." };
    }

    const payload: Record<string, unknown> = {
      organization_id: ctx.organizationId,
      contact_id: contactId,
      pol_gabinete: true,
      origem: "inbound",
      estado: "aberta",
      dono_kind: "ia",
      assunto: input.assunto.trim(),
      pol_prioridade: input.prioridade ?? "normal",
    };
    if (input.tipo) payload.pol_tipo = input.tipo;
    if (input.logradouro?.trim()) payload.pol_logradouro = input.logradouro.trim();
    if (input.numero?.trim()) payload.pol_numero = input.numero.trim();
    if (input.bairro?.trim()) payload.pol_bairro = input.bairro.trim();
    if (input.municipio?.trim()) payload.pol_municipio = input.municipio.trim();

    const { data, error } = await ctx.supabase
      .from("demandas")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return { erro_de_ensino: "Não consegui registrar a demanda agora. Avise que o gabinete vai anotar manualmente." };
    }
    const demandaId = (data as { id: string }).id;

    // Linha do tempo: a demanda nasceu da conversa com a IA.
    await ctx.supabase.from("pol_demanda_eventos").insert({
      organization_id: ctx.organizationId,
      demanda_id: demandaId,
      tipo: "estado_alterado",
      descricao: "Demanda registrada pela IA a partir da conversa com o cidadão",
    });

    return {
      demanda_id: demandaId,
      registrada: true,
      mensagem_sugerida:
        "Anotei o seu pedido aqui no gabinete e vamos acompanhar. Assim que houver novidade, te retorno por aqui.",
    };
  },
};

const listarInput = {
  contact_id: z
    .string()
    .uuid()
    .optional()
    .describe("Normalmente vazio — usa o cidadão da conversa automaticamente."),
};

export const crmListarDemandasCidadao: McpToolDefinition<typeof listarInput> = {
  name: "crm_listar_demandas_cidadao",
  description:
    "Lista as demandas que o cidadão da conversa já abriu no gabinete, da mais recente para a mais antiga, com o " +
    "assunto e em que pé está (aberta, em atendimento, encaminhada, atendida, encerrada). Use ANTES de registrar uma " +
    "demanda nova, para não duplicar, e para saber o histórico antes de responder.",
  inputSchema: listarInput,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const contactId = ctx.contatoDoTurno ?? input.contact_id ?? null;
    if (!contactId) return { demandas: [] };

    const { data } = await ctx.supabase
      .from("demandas")
      .select("id, assunto, estado, created_at")
      .eq("organization_id", ctx.organizationId)
      .eq("contact_id", contactId)
      .eq("pol_gabinete", true)
      .order("created_at", { ascending: false })
      .limit(20);

    const demandas = ((data ?? []) as { id: string; assunto: string | null; estado: string; created_at: string }[]).map((d) => ({
      id: d.id,
      assunto: d.assunto ?? "—",
      estado: d.estado,
      aberta_em: d.created_at,
    }));
    return { demandas };
  },
};

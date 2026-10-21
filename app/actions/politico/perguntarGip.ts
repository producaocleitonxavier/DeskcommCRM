"use server";

/**
 * "Pergunte ao GIP" — assistente de inteligência política em linguagem natural.
 * Em vez da infra pesada do SAM (LangGraph/SQL/grafo), usa TOOL-CALLING do SDK
 * ai: o modelo escolhe qual das NOSSAS funções de dados chamar (votos TSE,
 * território, projeção de cadeiras, opinião pública, base do CRM), executa, e
 * responde ancorado no número real. Nada inventado. Mandato e cidade entram como
 * contexto para o modelo preencher os parâmetros.
 */

import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { obterMandatoTse } from "@/app/actions/politico/obras-actions";
import { resumoCandidato, drillCandidato, rankingCandidatos } from "@/app/actions/politico/raioX";
import { dadosCadeiras } from "@/app/actions/politico/projecaoCadeiras";
import { resumoOpiniao, obterConfigMonitor } from "@/app/actions/politico/opiniaoPublica";

export interface GipMsg { role: "user" | "assistant"; content: string }
export type GipResposta = { ok: true; texto: string; ferramentas: string[] } | { ok: false; erro: string };

async function tseCodeDe(db: Awaited<ReturnType<typeof createClient>>, municipio: string): Promise<number | null> {
  const { data } = await db.from("intel_municipios").select("tse_code").ilike("nome", municipio).limit(1).maybeSingle();
  const tse = (data as { tse_code?: string } | null)?.tse_code;
  return tse ? Number(tse) : null;
}

export async function perguntarGip(pergunta: string, historico: GipMsg[] = []): Promise<GipResposta> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida." };
  if (!pergunta.trim()) return { ok: false, erro: "Escreva uma pergunta." };

  const [mandato, cfg] = await Promise.all([obterMandatoTse(), obterConfigMonitor()]);
  const cerebro = await cerebroDaOrg(createAdminClient(), org.orgId);
  if ("erro" in cerebro) return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };
  const db = await createClient();
  const cidadePadrao = cfg.cidade;
  const usadas = new Set<string>();

  const semMandato = "Nenhum mandato (candidato TSE) está configurado. Peça para configurar em Obras › Meu mandato.";

  const tools = {
    buscar_candidato: tool({
      description: "Busca candidatos pelo nome na eleição do mandato (TSE). Use para achar o sq (identificador) de um candidato, inclusive adversários.",
      inputSchema: z.object({ nome: z.string().describe("nome ou parte do nome do candidato") }),
      execute: async ({ nome }) => {
        usadas.add("buscar_candidato");
        if (!mandato) return { erro: semMandato };
        const r = await rankingCandidatos(mandato.electionId, nome, 8, 0);
        return { candidatos: r.map((c) => ({ sq: c.sq, nome: c.nomeUrna || c.nome, partido: c.partido, votos: c.votos, situacao: c.situacao })) };
      },
    }),
    votacao_candidato: tool({
      description: "Votação de um candidato (por sq) na eleição do mandato: votos totais, % do estado, situação, e opcionalmente os bairros onde mais fez voto num município.",
      inputSchema: z.object({ sq: z.string(), municipio: z.string().optional().describe("município para detalhar os redutos por bairro") }),
      execute: async ({ sq, municipio }) => {
        usadas.add("votacao_candidato");
        if (!mandato) return { erro: semMandato };
        const resumo = await resumoCandidato(mandato.electionId, sq);
        if (!resumo) return { erro: "Candidato não encontrado." };
        const out: Record<string, unknown> = {
          nome: resumo.nomeUrna, partido: resumo.partido, situacao: resumo.situacao,
          votos_totais: resumo.votos, pct_estado: resumo.totalEleicao > 0 ? +((resumo.votos / resumo.totalEleicao) * 100).toFixed(2) : 0,
        };
        if (municipio) {
          const tse = await tseCodeDe(db, municipio);
          if (tse) {
            const bairros = await drillCandidato(mandato.electionId, sq, "bairro", tse);
            out.municipio = municipio;
            out.votos_no_municipio = bairros.reduce((s, b) => s + b.votos, 0);
            out.redutos = bairros.filter((b) => b.votos > 0).slice(0, 8).map((b) => ({ bairro: b.rotulo, votos: b.votos }));
          }
        }
        return out;
      },
    }),
    peso_do_bairro: tool({
      description: "Para um BAIRRO: votos do SEU candidato (mandato) ali, o universo de votos do cargo no bairro, e quantos contatos da sua base de CRM você tem nele. Responde 'você investiu/tem força onde?'.",
      inputSchema: z.object({ bairro: z.string(), municipio: z.string().optional() }),
      execute: async ({ bairro, municipio }) => {
        usadas.add("peso_do_bairro");
        if (!mandato) return { erro: semMandato };
        const cidade = municipio || cidadePadrao;
        if (!cidade) return { erro: "Informe o município." };
        const tse = await tseCodeDe(db, cidade);
        if (!tse) return { erro: `Município ${cidade} não encontrado.` };
        const { data } = await db.rpc("intel_peso_bairro", { p_election: mandato.electionId, p_sq: Number(mandato.sq), p_municipio: tse, p_bairro: bairro });
        const p = ((data ?? [])[0] ?? { meus_votos: 0, universo: 0, leads: 0 }) as { meus_votos: number; universo: number; leads: number };
        return {
          bairro, municipio: cidade,
          seus_votos: Number(p.meus_votos), universo_votos_do_cargo: Number(p.universo),
          pct_do_bairro: Number(p.universo) > 0 ? +((Number(p.meus_votos) / Number(p.universo)) * 100).toFixed(1) : 0,
          sua_base_crm: Number(p.leads),
        };
      },
    }),
    projecao_cadeiras: tool({
      description: "Projeção de cadeiras (quociente eleitoral/partidário) da eleição do mandato, num município (vereador) ou no estado (deputado). Retorna QE, nº de cadeiras e os partidos com mais cadeiras. Aproximação nominal (sem legenda).",
      inputSchema: z.object({ municipio: z.string().optional() }),
      execute: async ({ municipio }) => {
        usadas.add("projecao_cadeiras");
        if (!mandato) return { erro: semMandato };
        const cidade = municipio || cidadePadrao;
        const tse = cidade ? await tseCodeDe(db, cidade) : null;
        const dados = await dadosCadeiras(mandato.electionId, tse ? String(tse) : null, cidade || "Minas Gerais");
        if (dados.cadeiras === 0) return { erro: "Sem dados de cadeiras para este recorte (a eleição pode não ser proporcional)." };
        const vv = dados.candidatos.reduce((s, c) => s + c.votos, 0);
        const qe = Math.floor(vv / dados.cadeiras);
        const porPartido = new Map<string, number>();
        for (const c of dados.candidatos) porPartido.set(c.partido, (porPartido.get(c.partido) ?? 0) + c.votos);
        const top = [...porPartido.entries()].map(([sigla, votos]) => ({ sigla, votos, qp: qe > 0 ? Math.floor(votos / qe) : 0 }))
          .sort((a, b) => b.votos - a.votos).slice(0, 8);
        return { escopo: dados.escopo, quociente_eleitoral: qe, cadeiras: dados.cadeiras, votos_validos_nominais: vv, partidos: top };
      },
    }),
    opiniao_publica: tool({
      description: "Resumo da escuta social/imprensa: total de menções, sentimento (positivo/neutro/negativo) e as pautas mais quentes com a tendência.",
      inputSchema: z.object({}),
      execute: async () => {
        usadas.add("opiniao_publica");
        const r = await resumoOpiniao();
        if (r.total === 0) return { aviso: "Nenhuma menção captada ainda. Peça para configurar e atualizar em Opinião Pública." };
        return {
          total: r.total, positivos: r.positivos, neutros: r.neutros, negativos: r.negativos,
          indice: r.total > 0 ? Math.round(((r.positivos - r.negativos) / r.total) * 100) : 0,
          pautas_quentes: r.topicos.slice(0, 6).map((t) => ({ tema: t.topico, mencoes: t.total, polaridade_media: +t.polaridadeMedia.toFixed(2) })),
        };
      },
    }),
    minha_base_no_bairro: tool({
      description: "A sua base de CRM num bairro: contatos por temperatura (quentes/mornos/frios), apoiadores, e demandas abertas/resolvidas. É a base da operação, não eleitores.",
      inputSchema: z.object({ bairro: z.string(), cidade: z.string().optional() }),
      execute: async ({ bairro, cidade }) => {
        usadas.add("minha_base_no_bairro");
        const cid = cidade || cidadePadrao;
        if (!cid) return { erro: "Informe a cidade." };
        const { data } = await db.rpc("intel_bairro_crm", { p_cidade: cid, p_bairro: bairro });
        const c = ((data ?? [])[0] ?? {}) as Record<string, number>;
        return {
          bairro, cidade: cid,
          contatos: Number(c.leads_total ?? 0), quentes: Number(c.leads_quente ?? 0), mornos: Number(c.leads_morno ?? 0), frios: Number(c.leads_frio ?? 0),
          apoiadores_ou_mais: Number(c.leads_forte ?? 0), demandas_abertas: Number(c.dem_abertas ?? 0), demandas_resolvidas: Number(c.dem_resolvidas ?? 0),
        };
      },
    }),
  };

  const contexto = [
    mandato ? `Mandato configurado (candidato do cliente no TSE): ${mandato.nome || "sem nome"} (election ${mandato.electionId}, sq ${mandato.sq}). Use-o como padrão quando o usuário disser "eu"/"meu"/"nosso candidato".` : "Nenhum mandato TSE configurado — avise o usuário a configurar em Obras › Meu mandato se a pergunta exigir voto do candidato.",
    cidadePadrao ? `Cidade-base da operação: ${cidadePadrao}. Use como município padrão quando não for dito outro.` : "Cidade-base não configurada.",
  ].join(" ");

  const system =
    "Você é o GIP — Guerrilheiros Inteligência Política, o assistente de inteligência de uma campanha eleitoral no Brasil. " +
    "Responda em português do Brasil, direto e acionável. Use SOMENTE os dados que as ferramentas retornarem — NUNCA invente votos, pesquisas, nomes ou números. Se faltar dado, diga o que falta e como obter. " +
    "Chame quantas ferramentas forem necessárias para responder (ex.: buscar o candidato para achar o sq e depois consultar a votação). " +
    "DISTINÇÃO CRÍTICA: o VOTO é do TSE; a BASE DE CRM é da OPERAÇÃO que usa a ferramenta, NÃO é do candidato nem é 'eleitorado' — chame de 'sua base'. O universo é 'votos do cargo', nunca 'eleitores'. " +
    "A projeção de cadeiras é aproximação nominal (sem legenda) — diga isso ao citá-la. Seja conciso: vá ao ponto, use números e cite bairros/partidos pelo nome. " +
    contexto;

  const mensagens = [
    ...historico.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: pergunta },
  ];

  try {
    const { text } = await generateText({
      model: modeloDoCerebro(cerebro),
      system,
      messages: mensagens,
      tools,
      stopWhen: stepCountIs(6),
      maxOutputTokens: 1200,
    });
    const texto = text.trim();
    if (!texto) return { ok: false, erro: "Não consegui responder agora. Tente reformular." };
    return { ok: true, texto, ferramentas: [...usadas] };
  } catch {
    return { ok: false, erro: "Falha ao consultar os dados. Tente novamente em instantes." };
  }
}

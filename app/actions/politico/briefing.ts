"use server";

/**
 * Dossiê Estratégico (Pilar 4 — IA cross-data). O capstone do módulo: para um
 * candidato + município, cruza o desempenho dele no TSE (redutos por bairro), a
 * projeção VIVA (universo de votos × a base do CRM por zona) e o total estadual,
 * e a IA escreve um BRIEFING executivo de campanha. Nada de dado inventado —
 * só o que está nas tabelas. Caminho leve de IA (lib/ai/cerebro); degrada em PT.
 */

import { generateText } from "ai";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { resumoCandidato, drillCandidato } from "@/app/actions/politico/raioX";
import { projecaoZonal } from "@/app/actions/politico/projecao";

export interface AdversarioReduto {
  nome: string;
  partido: string | null;
  votosReduto: number; // votos do adversário nos redutos do candidato
  votosMunicipio: number; // votos totais do adversário no município
}

export type ResultadoBriefing =
  | { ok: true; texto: string; candidato: string; adversarios: AdversarioReduto[]; redutos: string }
  | { ok: false; erro: string };

export async function briefingEstrategico(
  electionId: number,
  sq: string,
  municipioTse: string,
  munNome: string,
  cargoAno: string,
  ano: number,
): Promise<ResultadoBriefing> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  const cdMun = Number(municipioTse);
  const db = await createClient();
  const [resumo, bairros, proj, advRpc] = await Promise.all([
    resumoCandidato(electionId, sq),
    drillCandidato(electionId, sq, "bairro", cdMun),
    projecaoZonal(electionId, municipioTse, ano),
    db.rpc("intel_adversarios_reduto", { p_election: electionId, p_municipio: cdMun, p_sq: Number(sq), p_nbairros: 5, p_nadv: 4 }),
  ]);

  if (!resumo) return { ok: false, erro: "Candidato não encontrado." };

  const advRows = (advRpc.data ?? []) as { nome_urna: string; partido_sigla: string | null; votos_reduto: number; votos_municipio: number; bairros: string | null }[];
  const adversarios: AdversarioReduto[] = advRows.map((a) => ({
    nome: a.nome_urna,
    partido: a.partido_sigla,
    votosReduto: Number(a.votos_reduto),
    votosMunicipio: Number(a.votos_municipio),
  }));
  const redutosNome = advRows[0]?.bairros ?? "";

  const nome = resumo.nomeUrna;
  const pctEstado = resumo.totalEleicao > 0 ? ((resumo.votos / resumo.totalEleicao) * 100).toFixed(2) : "0";
  const votosNoMun = bairros.reduce((s, b) => s + b.votos, 0);

  const redutos = bairros
    .filter((b) => b.votos > 0)
    .slice(0, 8)
    .map((b) => `${b.rotulo}: ${b.votos} votos (${b.universo > 0 ? ((b.votos / b.universo) * 100).toFixed(1) : "0"}% do bairro)`);

  // Zonas de oportunidade (muito voto, pouca presença da NOSSA base) e redutos da base.
  const oportunidades = proj.zonas
    .filter((z) => z.classe === "oportunidade" || z.classe === "deserto")
    .slice(0, 6)
    .map((z) => `Zona ${z.zona} (${z.universo.toLocaleString("pt-BR")} votos, sua base ${z.base}${z.bairros.length ? `, bairros: ${z.bairros.slice(0, 4).join(", ")}` : ""})`);

  const fatos: string[] = [
    `Candidato analisado (dados TSE): ${nome} (nº ${resumo.nr}${resumo.partido ? `, ${resumo.partido}` : ""})${resumo.situacao ? ` — ${resumo.situacao}` : ""}`,
    `Cargo/eleição: ${cargoAno}. Votos totais do candidato (MG): ${resumo.votos.toLocaleString("pt-BR")} (${pctEstado}% do estado).`,
    `Município analisado: ${munNome}. Votos do candidato no município: ${votosNoMun.toLocaleString("pt-BR")}.`,
    `Redutos do candidato (bairros onde mais fez voto): ${redutos.length ? redutos.join("; ") : "sem bairros com voto"}.`,
    `BASE DE CRM DA OPERAÇÃO (contatos da campanha que usa a ferramenta — NÃO são eleitores nem a base do candidato analisado): ${proj.baseTotal.toLocaleString("pt-BR")} contatos em ${munNome}.`,
    `Universo de VOTOS do cargo em ${munNome} (total de votos válidos, não eleitorado): ${proj.universoTotal.toLocaleString("pt-BR")}. Cobertura da base de CRM sobre esse volume: ${(proj.coberturaMedia * 100).toFixed(2)}%.`,
    `Zonas de oportunidade (muito VOTO do cargo e pouca presença da base de CRM): ${oportunidades.length ? oportunidades.join("; ") : "—"}.`,
    `ADVERSÁRIOS que mais disputam os redutos do candidato (${redutosNome || "bairros fortes"}) — votos deles NESSES bairros / votos totais no município: ${
      adversarios.length ? adversarios.map((a) => `${a.nome}${a.partido ? ` (${a.partido})` : ""} — ${a.votosReduto.toLocaleString("pt-BR")} no reduto / ${a.votosMunicipio.toLocaleString("pt-BR")} no município`).join("; ") : "—"
    }.`,
  ];

  const cerebro = await cerebroDaOrg(createAdminClient(), org.orgId);
  if ("erro" in cerebro) return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };

  const system =
    "Você é chefe de inteligência de uma campanha eleitoral no Brasil. Recebe dados REAIS do TSE e a base de contatos (CRM) da operação que usa a ferramenta, e escreve um " +
    "BRIEFING ESTRATÉGICO executivo, direto e acionável, em português do Brasil. " +
    "Use APENAS os números fornecidos — nunca invente votos, pesquisas, nomes ou fatos. " +
    "DISTINÇÃO CRÍTICA, nunca confunda: (a) o VOTO do candidato é dado do TSE; (b) a BASE DE CRM é da OPERAÇÃO que usa a ferramenta — NÃO é do candidato analisado nem é 'eleitorado'. Nunca escreva que os contatos do CRM são do candidato; chame-os de 'base de CRM da operação' ou 'sua base'. " +
    "Chame o universo sempre de 'votos do cargo' (jamais 'eleitores'/'eleitorado'). " +
    "NUNCA agrupe bairros em 'regional'/'região administrativa' nem cite o nome de uma regional (ex.: 'Regional Barreiro') — você NÃO recebeu esse dado e inferir pelo nome do bairro gera erro grave. Trabalhe só com os nomes de BAIRRO e ZONA exatamente como fornecidos. " +
    "Não prometa resultado futuro: 'oportunidade' é volume de voto onde a base de CRM é fraca. Markdown com títulos: " +
    "## Posição atual, ## Mapa de força (onde o candidato é forte), ## A batalha (quem disputa seus redutos), ## Onde crescer, ## Riscos, ## Plano de 90 dias. " +
    "Em 'A batalha', analise os adversários que mais fazem voto nos MESMOS bairros fortes do candidato: quem é a ameaça real ao território, quem apenas passa por ali, e o que isso exige. " +
    "No plano, liste ações concretas por zona/bairro (cadastrar base de CRM, presença física, evento, lideranças).";

  const prompt =
    `Escreva o briefing estratégico de campanha com base nos dados abaixo.\n\n` +
    fatos.join("\n") +
    `\n\nMáximo ~480 palavras, com os 6 títulos. Seja específico e cite bairros/zonas/adversários pelo nome. Priorize transformar os números em decisões.`;

  try {
    const { text } = await generateText({ model: modeloDoCerebro(cerebro), system, prompt, maxOutputTokens: 1300 });
    const texto = text.trim();
    if (!texto) return { ok: false, erro: "A IA não retornou texto. Tente novamente." };
    return { ok: true, texto, candidato: nome, adversarios, redutos: redutosNome };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente novamente em instantes." };
  }
}

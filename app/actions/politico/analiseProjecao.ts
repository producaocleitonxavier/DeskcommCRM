"use server";

/**
 * Leitura estratégica (IA) da Projeção do Território. Lê a projeção VIVA
 * (universo de votos × base do CRM por zona) e devolve um plano de "onde focar":
 * redutos a defender, oportunidades a conquistar (muito voto, pouca presença) e
 * zonas prioritárias com bairros. Ancorada nos números — não inventa voto.
 *
 * Caminho leve de IA (lib/ai/cerebro). Sem env nova; degrada em PT.
 */

import { generateText } from "ai";

import { createAdminClient } from "@/lib/supabase/admin";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { projecaoZonal } from "@/app/actions/politico/projecao";

export type ResultadoAnaliseProjecao = { ok: true; texto: string } | { ok: false; erro: string };

const CLASSE_LABEL: Record<string, string> = {
  reduto: "Reduto (forte)",
  consolidar: "Consolidar",
  oportunidade: "Oportunidade (muito voto, pouca presença)",
  deserto: "Deserto (vota e você tem zero base)",
};

export async function analiseProjecaoIA(
  electionId: number,
  municipioTse: string,
  munNome: string,
  cargoAno: string,
  ano: number,
): Promise<ResultadoAnaliseProjecao> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  const proj = await projecaoZonal(electionId, municipioTse, ano);
  if (proj.zonas.length === 0) return { ok: false, erro: "Sem dados de projeção para analisar." };

  const cobertura = (f: number) => `${(f * 100).toFixed(2)}%`;
  const linha = (z: (typeof proj.zonas)[number]) =>
    `Zona ${z.zona} [${CLASSE_LABEL[z.classe]}]: ${z.universo.toLocaleString("pt-BR")} votos no cargo, sua base ${z.base} (cobertura ${cobertura(z.cobertura)})` +
    (z.bairros.length ? ` — bairros: ${z.bairros.slice(0, 6).join(", ")}` : "");

  // Dá à IA as zonas ordenadas por universo (todas, são poucas: ~15-30 por município).
  const fatos: string[] = [
    `Município: ${munNome} · ${cargoAno}`,
    `Universo total de votos: ${proj.universoTotal.toLocaleString("pt-BR")} · Sua base total (CRM): ${proj.baseTotal.toLocaleString("pt-BR")} · Cobertura média: ${cobertura(proj.coberturaMedia)}`,
    `Zonas (${proj.zonas.length}):`,
    ...proj.zonas.map(linha),
  ];

  const cerebro = await cerebroDaOrg(createAdminClient(), org.orgId);
  if ("erro" in cerebro) return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };

  const system =
    "Você é estrategista eleitoral sênior no Brasil, consultor de campanha. Lê a PROJEÇÃO por zona de um município " +
    "(universo de VOTOS do cargo no TSE × a BASE DE CRM da operação que usa a ferramenta) e escreve um plano de ONDE FOCAR, em português do Brasil. " +
    "A base de CRM é da operação/campanha, NÃO é eleitorado nem a base de um candidato específico. Chame o universo de 'votos do cargo' (jamais 'eleitores'). " +
    "NUNCA invente 'regional'/'região administrativa' nem o nome de uma região a partir do nome do bairro — use só os nomes de bairro e zona dados. " +
    "Use APENAS os números dados — nunca invente votos, pesquisas ou nomes. Não prometa voto futuro: 'oportunidade' é volume de voto onde a base de CRM é fraca. " +
    "Markdown com títulos curtos: ## Panorama, ## Seus redutos (defender), ## Onde crescer (oportunidades), ## Plano de ação. " +
    "No plano, liste 3 a 5 zonas prioritárias citando os bairros concretos e a ação (cadastrar base, presença física, evento).";

  const prompt =
    `Faça a leitura estratégica da projeção abaixo e diga onde o candidato deve concentrar esforço.\n\n` +
    fatos.join("\n") +
    `\n\nResponda em no máximo ~320 palavras, com os 4 títulos. Priorize zonas de ALTO universo e BAIXA cobertura (onde há voto e falta base).`;

  try {
    const { text } = await generateText({ model: modeloDoCerebro(cerebro), system, prompt, maxOutputTokens: 900 });
    const texto = text.trim();
    if (!texto) return { ok: false, erro: "A IA não retornou texto. Tente novamente." };
    return { ok: true, texto };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente novamente em instantes." };
  }
}

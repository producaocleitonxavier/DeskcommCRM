"use server";

/**
 * Leitura estratégica (IA) da Arena Comparativa. Diferencial do War Room:
 * a IA não "acha" nada genérico — ela lê EXATAMENTE os números da comparação
 * em tela (candidatos, dimensão, recorte) e devolve uma análise acionável.
 *
 * Fluxo: recomputa o comparativo no servidor (mesmo RPC da tela) → destila em
 * fatos compactos (totais, quem lidera onde, redutos de cada um, disputas
 * acirradas) → generateText com teto baixo de tokens. Caminho leve de IA (mesmo
 * de gerarEncaminhamento), sem env nova; degrada com mensagem em PT.
 */

import { generateText } from "ai";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export type ResultadoAnaliseArena = { ok: true; texto: string } | { ok: false; erro: string };

type Dim = "zona" | "bairro" | "local" | "secao";
type Linha = { chave: string; rotulo: string; sq_candidato: number; votos: number; universo: number };

export interface EntradaAnaliseArena {
  electionId: number;
  municipioTse: string;
  munNome: string;
  cargoAno: string; // ex.: "Vereador 2024"
  dim: Dim;
  candidatos: { sq: string; nome: string }[];
  zona: number | null;
  bairro: string | null;
}

const DIM_LABEL: Record<Dim, string> = { zona: "zona eleitoral", bairro: "bairro", local: "local de votação (escola)", secao: "seção" };

export async function analiseArenaIA(entrada: EntradaAnaliseArena): Promise<ResultadoAnaliseArena> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (entrada.candidatos.length < 2) return { ok: false, erro: "Selecione pelo menos 2 candidatos." };

  const db = await createClient();
  const usaRecorte = entrada.dim === "local" || entrada.dim === "secao";
  const { data, error } = await db.rpc("intel_comparativo", {
    p_election: entrada.electionId,
    p_municipio: Number(entrada.municipioTse),
    p_dim: entrada.dim,
    p_sqs: entrada.candidatos.map((c) => Number(c.sq)),
    p_zona: usaRecorte ? entrada.zona ?? null : null,
    p_bairro: usaRecorte && entrada.bairro ? entrada.bairro : null,
  });
  if (error) return { ok: false, erro: "Não consegui ler os dados da comparação." };
  const linhas = (data ?? []) as Linha[];
  if (linhas.length === 0) return { ok: false, erro: "Sem dados nessa dimensão/recorte para analisar." };

  const nomeDe = new Map(entrada.candidatos.map((c) => [c.sq, c.nome]));
  const sqs = entrada.candidatos.map((c) => c.sq);

  // Pivot: chave -> { rotulo, universo, votos por sq }
  const porChave = new Map<string, { rotulo: string; universo: number; votos: Map<string, number> }>();
  for (const r of linhas) {
    const sq = String(r.sq_candidato);
    let e = porChave.get(r.chave);
    if (!e) { e = { rotulo: r.rotulo, universo: r.universo, votos: new Map() }; porChave.set(r.chave, e); }
    e.votos.set(sq, (e.votos.get(sq) ?? 0) + r.votos);
  }

  // Agregados por candidato dentro do recorte.
  const totalCand = new Map<string, number>(sqs.map((s) => [s, 0]));
  const lidera = new Map<string, number>(sqs.map((s) => [s, 0]));
  let universoTotal = 0;
  type Reduto = { rotulo: string; votos: number; pct: number };
  const redutos = new Map<string, Reduto[]>(sqs.map((s) => [s, []]));

  for (const [, e] of porChave) {
    universoTotal += e.universo;
    let melhorSq = "";
    let melhorV = -1;
    for (const s of sqs) {
      const v = e.votos.get(s) ?? 0;
      totalCand.set(s, (totalCand.get(s) ?? 0) + v);
      if (v > melhorV) { melhorV = v; melhorSq = s; }
      redutos.get(s)!.push({ rotulo: e.rotulo, votos: v, pct: e.universo > 0 ? (v / e.universo) * 100 : 0 });
    }
    if (melhorV > 0 && melhorSq) lidera.set(melhorSq, (lidera.get(melhorSq) ?? 0) + 1);
  }

  const nLocais = porChave.size;
  const dimLabel = DIM_LABEL[entrada.dim];
  const recorteTxt =
    entrada.bairro && usaRecorte ? `bairro ${entrada.bairro}` : entrada.zona != null && usaRecorte ? `Zona ${entrada.zona}` : "município inteiro";

  // Bloco de fatos compacto (top 4 redutos por candidato, por % no local).
  const fatos: string[] = [];
  fatos.push(`Município: ${entrada.munNome} · Cargo/ano: ${entrada.cargoAno}`);
  fatos.push(`Dimensão analisada: ${dimLabel} · Recorte: ${recorteTxt} · ${nLocais} ${dimLabel}(s) no recorte`);
  for (const s of sqs) {
    const nome = nomeDe.get(s) ?? s;
    const tot = totalCand.get(s) ?? 0;
    const pctGeral = universoTotal > 0 ? ((tot / universoTotal) * 100).toFixed(2) : "0";
    const lid = lidera.get(s) ?? 0;
    const top = redutos.get(s)!.filter((r) => r.votos > 0).sort((a, b) => b.pct - a.pct).slice(0, 4)
      .map((r) => `${r.rotulo} (${r.votos} votos, ${r.pct.toFixed(1)}%)`).join("; ");
    fatos.push(
      `Candidato ${nome}: ${tot} votos no recorte (${pctGeral}% do total do recorte), lidera em ${lid} de ${nLocais} ${dimLabel}(s). ` +
      `Redutos mais fortes: ${top || "sem votos relevantes"}.`,
    );
  }

  const cerebro = await cerebroDaOrg(createAdminClient(), org.orgId);
  if ("erro" in cerebro) return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };

  const system =
    "Você é estrategista eleitoral sênior no Brasil, consultor de campanha. Lê dados reais de votação do TSE e " +
    "escreve leituras estratégicas objetivas, em português do Brasil, para o candidato/assessoria. " +
    "Use APENAS os números fornecidos — nunca invente votos, pesquisas, nomes ou fatos. Seja direto e acionável. " +
    "NUNCA agrupe bairros em 'regional'/'região administrativa' nem cite o nome de uma regional — use só os nomes de bairro/zona/local exatamente como dados. " +
    "Formato em markdown com estes títulos curtos: **Panorama**, **Força de cada candidato**, **Onde atacar e onde defender**, **Recomendações práticas**. " +
    "Nas recomendações, cite bairros/zonas/locais concretos pelos nomes dados. Nada de encher linguiça.";

  const prompt =
    `Faça a leitura estratégica da disputa abaixo, comparando os candidatos na dimensão "${dimLabel}" dentro do recorte "${recorteTxt}".\n\n` +
    fatos.join("\n") +
    `\n\nResponda em no máximo ~320 palavras, com os 4 títulos pedidos. Foque no que o candidato deve FAZER com essa informação ` +
    `(onde já é forte e deve defender, onde o adversário domina e vale a pena disputar, redutos a visitar).`;

  try {
    const { text } = await generateText({
      model: modeloDoCerebro(cerebro),
      system,
      prompt,
      maxOutputTokens: 900,
    });
    const texto = text.trim();
    if (!texto) return { ok: false, erro: "A IA não retornou texto. Tente novamente." };
    return { ok: true, texto };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente novamente em instantes." };
  }
}

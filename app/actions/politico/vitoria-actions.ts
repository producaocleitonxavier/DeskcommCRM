"use server";

/**
 * VITÓRIAS (Situação Política / Antes&Depois). Duas peças:
 *  - `listarVitorias`: o RADAR — demandas resolvidas COM foto, prontas pra virar
 *    card. Nunca deixa a situação política passar batido (dor do chefe/Michael).
 *  - `gerarLegendaVitoria`: a IA escreve a legenda (factual, assistida, editável).
 *
 * Guardrails: factual (sem promessa de campanha — TSE); modo assistido (o gabinete
 * edita e decide); nada envia (o card é só pra baixar). Reusa cerebroDaOrg.
 */

import { generateText } from "ai";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";

const MIMES_IMAGEM = ["image/jpeg", "image/jpg", "image/png"];

export interface VitoriaRadar {
  demandaId: string;
  assunto: string;
  orgao: string | null;
  bairro: string | null;
  fechadaEm: string | null;
  fotos: number;
}

/**
 * RADAR: demandas do gabinete RESOLVIDAS nos últimos 90 dias que têm pelo menos
 * uma FOTO — a matéria-prima do "antes & depois". Consulta ao vivo (sem tabela
 * nova). Duas queries: resolvidas recentes + anexos-imagem delas, cruzadas em JS.
 */
export async function listarVitorias(limite = 60): Promise<VitoriaRadar[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();

  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: dems } = await db
    .from("demandas")
    .select("id, assunto, pol_orgao_destino, pol_bairro, fechada_em")
    .eq("organization_id", org.orgId)
    .eq("pol_gabinete", true)
    .eq("estado", "resolvida")
    .gte("fechada_em", desde)
    .order("fechada_em", { ascending: false })
    .limit(500);
  const resolvidas = (dems ?? []) as {
    id: string;
    assunto: string | null;
    pol_orgao_destino: string | null;
    pol_bairro: string | null;
    fechada_em: string | null;
  }[];
  if (resolvidas.length === 0) return [];

  const ids = resolvidas.map((d) => d.id);
  const { data: anexos } = await db
    .from("pol_demanda_anexos")
    .select("demanda_id, media_mime")
    .eq("organization_id", org.orgId)
    .in("demanda_id", ids)
    .in("media_mime", MIMES_IMAGEM)
    .limit(5000);
  const fotosPorDemanda = new Map<string, number>();
  for (const a of (anexos ?? []) as { demanda_id: string }[]) {
    fotosPorDemanda.set(a.demanda_id, (fotosPorDemanda.get(a.demanda_id) ?? 0) + 1);
  }

  return resolvidas
    .filter((d) => (fotosPorDemanda.get(d.id) ?? 0) > 0)
    .slice(0, limite)
    .map((d) => ({
      demandaId: d.id,
      assunto: d.assunto ?? "Demanda",
      orgao: d.pol_orgao_destino,
      bairro: d.pol_bairro,
      fechadaEm: d.fechada_em,
      fotos: fotosPorDemanda.get(d.id) ?? 0,
    }));
}

/** Contagem leve pro card do Hoje ("N vitórias pra mostrar"). */
export async function contarVitorias(): Promise<number> {
  const lista = await listarVitorias(200);
  return lista.length;
}

export type ResultadoLegenda = { ok: true; legenda: string } | { ok: false; erro: string };

/**
 * A IA escreve a legenda da vitória (Stories). Factual: pega o que foi resolvido,
 * por qual órgão, em quantos dias. NÃO promete nada (TSE). Tom de reconhecimento
 * do trabalho, não de propaganda. O gabinete edita antes de usar.
 */
export async function gerarLegendaVitoria(demandaId: string): Promise<ResultadoLegenda> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const admin = createAdminClient();

  const { data: d } = await admin
    .from("demandas")
    .select("assunto, pol_tipo, pol_orgao_destino, pol_bairro, pol_municipio, aberta_em, fechada_em, contacts(name)")
    .eq("organization_id", org.orgId)
    .eq("id", demandaId)
    .maybeSingle();
  if (!d) return { ok: false, erro: "Demanda não encontrada." };

  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo")
    .eq("organization_id", org.orgId)
    .maybeSingle();

  const cerebro = await cerebroDaOrg(admin, org.orgId);
  const assunto = (d.assunto as string | null) ?? "a demanda";
  const orgao = (d.pol_orgao_destino as string | null) ?? "";
  const bairro = (d.pol_bairro as string | null) ?? "";
  const cidade = (d.pol_municipio as string | null) ?? "";
  let dias: number | null = null;
  if (d.aberta_em && d.fechada_em) {
    dias = Math.max(0, Math.round((new Date(d.fechada_em as string).getTime() - new Date(d.aberta_em as string).getTime()) / 86_400_000));
  }
  const nome = (cfg?.nome_parlamentar as string | null)?.trim() || "o gabinete";

  // Sem IA: legenda factual montada em código (a feature não trava).
  if ("erro" in cerebro) {
    const base = `${assunto}${bairro ? ` no bairro ${bairro}` : ""} — resolvido${orgao ? ` junto à ${orgao}` : ""}${dias !== null ? ` em ${dias} ${dias === 1 ? "dia" : "dias"}` : ""}. Trabalho do gabinete pela comunidade.`;
    return { ok: true, legenda: base };
  }

  const system =
    "Você escreve a LEGENDA de um story (Instagram/WhatsApp Status) de um gabinete parlamentar no Brasil, " +
    "celebrando uma demanda da comunidade que foi RESOLVIDA. Tom: próximo, direto, de reconhecimento do " +
    "trabalho e da comunidade — NÃO publicitário, NÃO ufanista. REGRAS DURAS: não prometa nada (lei eleitoral), " +
    "não invente dados nem números, não peça voto. 2 a 3 frases curtas. Pode usar 1 ou 2 emojis discretos. " +
    "Responda SOMENTE com o texto da legenda.";
  const prompt =
    `Monte a legenda para este caso resolvido:\n` +
    `- O que era: ${assunto}\n` +
    (bairro ? `- Bairro: ${bairro}\n` : "") +
    (cidade ? `- Cidade: ${cidade}\n` : "") +
    (orgao ? `- Resolvido junto a: ${orgao}\n` : "") +
    (dias !== null ? `- Tempo até resolver: ${dias} dia(s)\n` : "") +
    `- Mandato: ${nome}\n\n` +
    `Escreva a legenda (2-3 frases, sem promessa, sem pedir voto).`;

  try {
    const { text } = await generateText({ model: modeloDoCerebro(cerebro), system, prompt, maxOutputTokens: 300 });
    const legenda = text.trim();
    if (!legenda) return { ok: false, erro: "A IA não retornou texto. Tente de novo." };
    return { ok: true, legenda };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente de novo." };
  }
}

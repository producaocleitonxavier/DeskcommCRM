"use server";

/**
 * BOLETIM SEMANAL DE INTELIGÊNCIA — a síntese RECORRENTE que amarra o módulo.
 *
 * Em vez do firehose minuto-a-minuto do concorrente (SAM), entregamos o que o
 * mandato regional realmente usa: o raio-x da SEMANA + o que fazer. Reúne, numa
 * página/PDF: sentimento (com variação vs. semana anterior), pautas quentes,
 * menções que importam, as DORES DO MANDATO (demandas do gabinete — o que a
 * escuta de mídia não enxerga), o radar de adversários e as ações recomendadas.
 * A IA escreve "a semana em 3 frases".
 *
 * ESCOPO ADAPTATIVO: o recorte (municipal/estadual/nacional) vem do tipo de
 * mandato (Identidade do Mandato) — vereador/prefeito = cidade; dep. estadual =
 * estado; dep. federal = Brasil. Reusa intel_mentions (Opinião Pública) e sinais.
 */

import { generateText } from "ai";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  lerIdentidadeDoMandato, escopoDaInteligencia, type AbrangenciaMandato,
} from "@/lib/politico/identidade-do-mandato";
import { atualizarMencoes } from "@/app/actions/politico/opiniaoPublica";

export interface BoletimSemanal {
  ok: true;
  geradoEm: string;
  mandatoNome: string | null;
  escopoRotulo: string;
  abrangencia: AbrangenciaMandato;
  lugar: string;
  periodoDe: string;
  periodoAte: string;
  resumoIa: string;
  sentimento: {
    indice: number;
    indiceAnterior: number;
    positivos: number; neutros: number; negativos: number;
    total: number; totalAnterior: number;
  };
  pautas: { topico: string; total: number; neg: number; pos: number }[];
  mencoes: { titulo: string; fonte: string | null; url: string | null; sentimento: string | null; canal: string; publicadoEm: string | null }[];
  dores: { grupo: string; total: number }[];
  doresNovas: number;
  doresResolvidas: number;
  doresBairros: { bairro: string; total: number }[];
  adversarios: { nome: string; risco: string; threat: number; sinais7d: number }[];
  acoes: { title: string; descricao: string; acao: string; severity: string }[];
  alertasAbertos: number;
  ultimaMencaoEm: string | null;
}
export type ResultadoBoletim = BoletimSemanal | { ok: false; erro: string };

const DIA = 86_400_000;
const prettyTipo = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export async function gerarBoletimSemanal(opcoes?: { atualizarAntes?: boolean }): Promise<ResultadoBoletim> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const bypass = user.is_platform_admin && !user.support;
  if (!bypass && ROLE_RANK[org.role] < ROLE_RANK.manager) {
    return { ok: false, erro: "Sem permissão (requer Gerente ou Administrador)." };
  }
  const orgId = org.orgId;
  const db = await createClient();
  const admin = createAdminClient();

  // Escopo adaptativo por tipo de mandato (vereador/prefeito=cidade; dep.
  // estadual=estado; dep. federal=Brasil). A UF virá do cadastro quando a tela de
  // tipo de mandato ganhar esse campo; por ora o escopo municipal usa a cidade.
  const identidade = await lerIdentidadeDoMandato(db, orgId);
  const escopo = escopoDaInteligencia(identidade, null);

  // Atualização da escuta antes de sintetizar (best-effort — não bloqueia).
  if (opcoes?.atualizarAntes) {
    try { await atualizarMencoes(); } catch { /* segue com o que há */ }
  }

  const agora = Date.now();
  const de = new Date(agora - 7 * DIA);
  const de14 = new Date(agora - 14 * DIA);
  const deISO = de.toISOString();

  // ── Escuta (intel_mentions, 14d p/ comparar semana vs. semana) ──────────────
  const { data: mRows } = await db
    .from("intel_mentions")
    .select("canal, fonte, titulo, url, publicado_em, created_at, sentimento, topico")
    .eq("organization_id", orgId)
    .gte("created_at", de14.toISOString())
    .order("created_at", { ascending: false })
    .limit(3000);
  const mencoes = (mRows ?? []) as {
    canal: string; fonte: string | null; titulo: string | null; url: string | null;
    publicado_em: string | null; created_at: string; sentimento: string | null; topico: string | null;
  }[];
  const quando = (m: { publicado_em: string | null; created_at: string }) => m.publicado_em ?? m.created_at;
  const daSemana = mencoes.filter((m) => quando(m) >= deISO);
  const daSemanaAnterior = mencoes.filter((m) => quando(m) < deISO);

  const conta = (arr: typeof mencoes) => {
    let pos = 0, neg = 0, neu = 0;
    for (const m of arr) {
      if (m.sentimento === "positivo") pos++;
      else if (m.sentimento === "negativo") neg++;
      else neu++;
    }
    const total = arr.length;
    const indice = total > 0 ? Math.round(((pos - neg) / total) * 100) : 0;
    return { pos, neg, neu, total, indice };
  };
  const c = conta(daSemana);
  const cAnt = conta(daSemanaAnterior);

  // Pautas quentes da semana (por tópico).
  const pautaMap = new Map<string, { total: number; neg: number; pos: number }>();
  for (const m of daSemana) {
    if (!m.topico) continue;
    const p = pautaMap.get(m.topico) ?? { total: 0, neg: 0, pos: 0 };
    p.total++;
    if (m.sentimento === "negativo") p.neg++;
    else if (m.sentimento === "positivo") p.pos++;
    pautaMap.set(m.topico, p);
  }
  const pautas = [...pautaMap.entries()]
    .map(([topico, v]) => ({ topico, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Menções que importam: negativas primeiro, depois recentes.
  const relevantes = [...daSemana].sort((a, b) => {
    const pa = a.sentimento === "negativo" ? 0 : a.sentimento === "positivo" ? 1 : 2;
    const pb = b.sentimento === "negativo" ? 0 : b.sentimento === "positivo" ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return quando(b).localeCompare(quando(a));
  }).slice(0, 8).map((m) => ({
    titulo: m.titulo ?? "", fonte: m.fonte, url: m.url, sentimento: m.sentimento, canal: m.canal, publicadoEm: m.publicado_em,
  }));

  // ── Dores do mandato (demandas do gabinete — o diferencial) ─────────────────
  const { data: demRows } = await db
    .from("demandas")
    .select("estado, pol_tipo, pol_bairro, aberta_em, fechada_em")
    .eq("organization_id", orgId)
    .eq("pol_gabinete", true)
    .gte("aberta_em", de14.toISOString())
    .limit(5000);
  const dem = (demRows ?? []) as { estado: string | null; pol_tipo: string | null; pol_bairro: string | null; aberta_em: string | null; fechada_em: string | null }[];
  const novas = dem.filter((d) => (d.aberta_em ?? "") >= deISO);
  const doresNovas = novas.length;
  const doresResolvidas = dem.filter((d) => d.estado === "resolvida" && (d.fechada_em ?? "") >= deISO).length;
  const doresTipoMap = new Map<string, number>();
  const doresBairroMap = new Map<string, number>();
  for (const d of novas) {
    const t = (d.pol_tipo ?? "").trim();
    if (t) doresTipoMap.set(t, (doresTipoMap.get(t) ?? 0) + 1);
    const b = (d.pol_bairro ?? "").trim();
    if (b) doresBairroMap.set(b, (doresBairroMap.get(b) ?? 0) + 1);
  }
  const dores = [...doresTipoMap.entries()].map(([grupo, total]) => ({ grupo: prettyTipo(grupo), total })).sort((a, b) => b.total - a.total).slice(0, 6);
  const doresBairros = [...doresBairroMap.entries()].map(([bairro, total]) => ({ bairro, total })).sort((a, b) => b.total - a.total).slice(0, 6);

  // ── Adversários (radar) ─────────────────────────────────────────────────────
  const { data: oppRows } = await db
    .from("pol_opponents")
    .select("id, name, risk_level, threat_score")
    .eq("organization_id", orgId)
    .eq("active", true)
    .order("threat_score", { ascending: false })
    .limit(10);
  const opps = (oppRows ?? []) as { id: string; name: string; risk_level: string | null; threat_score: number | null }[];
  let sinaisPorOpp = new Map<string, number>();
  if (opps.length) {
    const { data: sig } = await db.from("pol_opponent_signals").select("opponent_id").eq("organization_id", orgId).gte("created_at", deISO).limit(2000);
    for (const s of (sig ?? []) as { opponent_id: string }[]) sinaisPorOpp.set(s.opponent_id, (sinaisPorOpp.get(s.opponent_id) ?? 0) + 1);
  }
  const adversarios = opps.map((o) => ({
    nome: o.name, risco: o.risk_level ?? "low", threat: Number(o.threat_score ?? 0), sinais7d: sinaisPorOpp.get(o.id) ?? 0,
  }));

  // ── Ações recomendadas (sinais de decisão pendentes) ────────────────────────
  const { data: sigRows } = await db
    .from("pol_decision_signals")
    .select("severity, data, created_at, processed_at")
    .eq("organization_id", orgId)
    .is("processed_at", null)
    .order("created_at", { ascending: false })
    .limit(8);
  const acoes = ((sigRows ?? []) as { severity: string | null; data: { title?: string; descricao?: string; acao?: string } | null }[]).map((s) => ({
    title: s.data?.title ?? "Sinal estratégico",
    descricao: s.data?.descricao ?? "",
    acao: s.data?.acao ?? "",
    severity: s.severity ?? "low",
  }));

  // Alertas abertos.
  const { data: alRows } = await db.from("pol_alerts").select("id").eq("organization_id", orgId).eq("status", "open").limit(500);
  const alertasAbertos = (alRows ?? []).length;

  const ultimaMencaoEm = mencoes[0] ? quando(mencoes[0]) : null;

  // ── Síntese IA: "a semana em 3 frases" ──────────────────────────────────────
  let resumoIa = "";
  const cerebro = await cerebroDaOrg(admin, orgId);
  if (!("erro" in cerebro)) {
    const varInd = c.indice - cAnt.indice;
    const fatos = [
      `Escopo: ${escopo.rotulo} (abrangência ${escopo.abrangencia}).`,
      `Mandato: ${identidade.nomeParlamentar ?? "o gabinete"}${identidade.cargo ? `, ${identidade.cargo}` : ""}.`,
      `Sentimento da semana: índice ${c.indice >= 0 ? "+" : ""}${c.indice} (de -100 a +100), com ${c.pos} positivas, ${c.neu} neutras, ${c.neg} negativas em ${c.total} menções. Semana anterior: índice ${cAnt.indice >= 0 ? "+" : ""}${cAnt.indice} em ${cAnt.total} menções (variação ${varInd >= 0 ? "+" : ""}${varInd} pontos).`,
      `Pautas quentes: ${pautas.length ? pautas.map((p) => `${p.topico} (${p.total}${p.neg ? `, ${p.neg} neg` : ""})`).join("; ") : "sem pautas captadas"}.`,
      `Dores do mandato (demandas da semana): ${doresNovas} novas, ${doresResolvidas} resolvidas. Por tema: ${dores.length ? dores.map((d) => `${d.grupo} (${d.total})`).join("; ") : "—"}. Bairros: ${doresBairros.length ? doresBairros.map((d) => `${d.bairro} (${d.total})`).join("; ") : "—"}.`,
      `Adversários no radar: ${adversarios.length ? adversarios.map((a) => `${a.nome} (risco ${a.risco}, ${a.sinais7d} sinais na semana)`).join("; ") : "nenhum cadastrado"}.`,
      `Ações recomendadas pendentes: ${acoes.length}. Alertas abertos: ${alertasAbertos}.`,
    ].join("\n");
    const system =
      "Você é o chefe de inteligência de um mandato político no Brasil. Escreva o PARÁGRAFO DE ABERTURA de um boletim SEMANAL para o político e sua equipe — 'a semana em 3 a 4 frases'. " +
      "Linguagem direta, de quem decide, sem jargão. Conecte os pontos que só nós cruzamos: o que a MÍDIA falou (pautas) versus o que o POVO pediu no gabinete (dores/demandas) — se batem ou divergem, diga. " +
      "Destaque a variação de sentimento vs. a semana passada (subiu/caiu) e a prioridade da semana. Não invente número que não está nos fatos. Respeite o escopo informado (municipal/estadual/nacional). " +
      "Máximo ~90 palavras, em um único parágrafo, sem título.";
    try {
      const { text } = await generateText({ model: modeloDoCerebro(cerebro), system, prompt: fatos, maxOutputTokens: 400 });
      resumoIa = text.trim();
    } catch { /* resumo é best-effort */ }
  }

  return {
    ok: true,
    geradoEm: new Date().toISOString(),
    mandatoNome: identidade.nomeParlamentar,
    escopoRotulo: escopo.rotulo,
    abrangencia: escopo.abrangencia,
    lugar: escopo.lugar,
    periodoDe: deISO,
    periodoAte: new Date(agora).toISOString(),
    resumoIa,
    sentimento: {
      indice: c.indice, indiceAnterior: cAnt.indice,
      positivos: c.pos, neutros: c.neu, negativos: c.neg,
      total: c.total, totalAnterior: cAnt.total,
    },
    pautas,
    mencoes: relevantes,
    dores,
    doresNovas,
    doresResolvidas,
    doresBairros,
    adversarios,
    acoes,
    alertasAbertos,
    ultimaMencaoEm,
  };
}

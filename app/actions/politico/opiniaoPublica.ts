"use server";

/**
 * Pilar 2 — Opinião Pública (escuta social). Fase 1: monitora termos (nome do
 * candidato, cidade, bairros, temas), capta menções da IMPRENSA via Google News
 * RSS (sem key, server-side) e a IA (cerebro) classifica polaridade/sentimento/
 * tópico. Comentários do Instagram (ManyChat) entram na Fase 1b, no mesmo modelo.
 * Espelha a lógica do SAM (sentimento + tópico + território) sem a infra pesada.
 */

import { generateText } from "ai";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { gerarSinaisAdversarios } from "@/app/actions/politico/adversarios";

export interface MonitorConfig {
  termosNome: string[];
  cidade: string | null;
  bairros: string[];
  temas: string[];
}

export interface Mencao {
  id: string;
  canal: string;
  fonte: string | null;
  autor: string | null;
  titulo: string | null;
  url: string | null;
  publicadoEm: string | null;
  polaridade: number | null;
  sentimento: string | null;
  topico: string | null;
  municipio: string | null;
  bairro: string | null;
  termo: string | null;
}

export interface ResumoOpiniao {
  total: number;
  positivos: number;
  neutros: number;
  negativos: number;
  porDia: { dia: string; total: number; pos: number; neg: number }[];
  porCanal: { canal: string; total: number }[];
  topicos: { topico: string; total: number; polaridadeMedia: number }[];
}

export async function obterConfigMonitor(): Promise<MonitorConfig> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { termosNome: [], cidade: null, bairros: [], temas: [] };
  const db = await createClient();
  const { data } = await db.from("intel_monitor_config").select("*").eq("organization_id", org.orgId).maybeSingle();
  const c = data as { termos_nome?: string[]; cidade?: string | null; bairros?: string[]; temas?: string[] } | null;
  return {
    termosNome: c?.termos_nome ?? [],
    cidade: c?.cidade ?? null,
    bairros: c?.bairros ?? [],
    temas: c?.temas ?? [],
  };
}

export async function salvarConfigMonitor(cfg: MonitorConfig): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida." };
  const db = await createClient();
  const { error } = await db.from("intel_monitor_config").upsert(
    {
      organization_id: org.orgId,
      termos_nome: cfg.termosNome.map((t) => t.trim()).filter(Boolean).slice(0, 10),
      cidade: cfg.cidade?.trim() || null,
      bairros: cfg.bairros.map((b) => b.trim()).filter(Boolean).slice(0, 30),
      temas: cfg.temas.map((t) => t.trim()).filter(Boolean).slice(0, 20),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

// ── RSS (Google News) ───────────────────────────────────────────────────────

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

interface ItemRss { titulo: string; url: string; fonte: string | null; publicadoEm: string | null }

async function buscarNoticias(query: string, maxItens = 15): Promise<ItemRss[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "WarRoom/2.0 (+monitoramento)" }, next: { revalidate: 0 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const itens: ItemRss[] = [];
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    for (const b of blocks.slice(0, maxItens)) {
      const titulo = decode((b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""));
      const link = (b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
      const pub = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "").trim();
      const fonte = decode((b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "")) || null;
      if (!titulo || !link) continue;
      itens.push({ titulo, url: link, fonte, publicadoEm: pub ? new Date(pub).toISOString() : null });
    }
    return itens;
  } catch {
    return [];
  }
}

// ── Atualização (ingestão + classificação) ──────────────────────────────────

export async function atualizarMencoes(): Promise<{ ok: boolean; novas: number; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, novas: 0, erro: "Sessão inválida." };
  const cfg = await obterConfigMonitor();
  if (cfg.termosNome.length === 0 && !cfg.cidade && cfg.temas.length === 0) {
    return { ok: false, novas: 0, erro: "Configure ao menos um termo (nome, cidade ou tema) antes de atualizar." };
  }
  const db = await createClient();

  // Monta as buscas: nome do candidato; cada tema combinado com a cidade.
  const buscas: { q: string; termo: string }[] = [];
  for (const nome of cfg.termosNome) buscas.push({ q: `"${nome}"`, termo: nome });
  if (cfg.cidade) {
    for (const tema of cfg.temas) buscas.push({ q: `${tema} ${cfg.cidade}`, termo: tema });
    if (cfg.temas.length === 0) buscas.push({ q: cfg.cidade, termo: cfg.cidade });
  }
  if (buscas.length === 0) return { ok: false, novas: 0, erro: "Nada para buscar." };

  // Busca RSS (em paralelo, cap de 8 buscas por atualização).
  const lotes = await Promise.all(buscas.slice(0, 8).map((b) => buscarNoticias(b.q).then((itens) => itens.map((i) => ({ ...i, termo: b.termo })))));
  const itens = lotes.flat();
  if (itens.length === 0) return { ok: true, novas: 0 };

  // Dedupe contra o que já existe (urls recentes da org).
  const { data: existentes } = await db.from("intel_mentions").select("url").eq("organization_id", org.orgId).order("created_at", { ascending: false }).limit(2000);
  const urlsExistentes = new Set(((existentes ?? []) as { url: string | null }[]).map((r) => r.url).filter(Boolean));

  const bairrosLower = cfg.bairros.map((b) => b.toLowerCase());
  const novos = [];
  const vistosAgora = new Set<string>();
  for (const it of itens) {
    if (!it.url || urlsExistentes.has(it.url) || vistosAgora.has(it.url)) continue;
    vistosAgora.add(it.url);
    const tl = it.titulo.toLowerCase();
    const bairro = cfg.bairros.find((_, idx) => tl.includes(bairrosLower[idx]!)) ?? null;
    novos.push({
      organization_id: org.orgId,
      canal: "imprensa",
      fonte: it.fonte,
      titulo: it.titulo,
      url: it.url,
      publicado_em: it.publicadoEm,
      municipio: cfg.cidade,
      bairro,
      termo: it.termo,
      processado: false,
    });
  }
  if (novos.length === 0) return { ok: true, novas: 0 };

  const { data: inseridas } = await db.from("intel_mentions").insert(novos).select("id, titulo");
  const linhas = (inseridas ?? []) as { id: string; titulo: string }[];

  // Classifica sentimento/tópico via IA, em um único lote.
  await classificar(org.orgId, linhas.map((l) => ({ id: l.id, titulo: l.titulo })), cfg);

  // Motor de sinais: a escuta vira Alertas + Decisão + sinais de Adversário.
  await gerarSinaisDaOpiniao(db, org.orgId);
  await gerarSinaisAdversarios(db, org.orgId);

  return { ok: true, novas: linhas.length };
}

async function classificar(orgId: string, itens: { id: string; titulo: string }[], cfg: MonitorConfig) {
  if (itens.length === 0) return;
  const cerebro = await cerebroDaOrg(createAdminClient(), orgId);
  if ("erro" in cerebro) return; // sem IA: menções ficam sem sentimento (não bloqueia)
  const alvo = cfg.termosNome[0] || cfg.cidade || "o candidato";
  const lista = itens.slice(0, 40).map((it, i) => `${i}: ${it.titulo}`).join("\n");
  const system =
    "Você é analista de inteligência de uma campanha eleitoral local. Classifique cada MANCHETE pelo TOM para a leitura política, não por neutralidade jornalística. Regras:\n" +
    `• Se a manchete cita diretamente "${alvo}", classifique em relação a ele (elogio/avanço = positivo; crítica/escândalo = negativo).\n` +
    "• Se NÃO cita o alvo, classifique o tom do FATO para a cidade: problema/dor/crise (crime, violência, obra parada, reclamação, falta de serviço, tragédia) = 'negativo' (pauta a atacar/responder); conquista/entrega/elogio/avanço (prêmio, inauguração, melhoria, aprovação de projeto) = 'positivo' (pauta a capitalizar); apenas factual sem carga = 'neutro'.\n" +
    "Dê polaridade de -1.0 (dor forte) a +1.0 (conquista forte) e um tópico curto (1-2 palavras: 'segurança', 'saúde', 'obras', 'educação'…). Evite 'neutro' quando houver claramente dor ou conquista.\n" +
    'Responda SOMENTE um array JSON: [{"i":0,"sentimento":"negativo","polaridade":-0.6,"topico":"segurança"}]. Sem texto fora do JSON.';
  const prompt = `Manchetes:\n${lista}`;
  try {
    const { text } = await generateText({ model: modeloDoCerebro(cerebro), system, prompt, maxOutputTokens: 1500 });
    const ini = text.indexOf("["); const fim = text.lastIndexOf("]");
    if (ini < 0 || fim <= ini) return;
    const arr = JSON.parse(text.slice(ini, fim + 1)) as { i: number; sentimento?: string; polaridade?: number; topico?: string }[];
    const db = await createClient();
    for (const r of arr) {
      const it = itens[r.i];
      if (!it) continue;
      const sent = ["positivo", "neutro", "negativo"].includes(String(r.sentimento)) ? String(r.sentimento) : "neutro";
      const pol = typeof r.polaridade === "number" ? Math.max(-1, Math.min(1, r.polaridade)) : 0;
      await db.from("intel_mentions").update({ sentimento: sent, polaridade: pol, topico: (r.topico ?? "").slice(0, 40) || null, processado: true }).eq("id", it.id).eq("organization_id", orgId);
    }
  } catch {
    /* classificação é best-effort */
  }
}

/** Reavalia o sentimento das menções recentes com a lógica atual (uso pontual). */
export async function reavaliarSentimento(limite = 40): Promise<{ ok: boolean; n: number; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, n: 0, erro: "Sessão inválida." };
  const cfg = await obterConfigMonitor();
  const db = await createClient();
  const { data } = await db.from("intel_mentions").select("id, titulo").eq("organization_id", org.orgId).order("publicado_em", { ascending: false, nullsFirst: false }).limit(limite);
  const itens = ((data ?? []) as { id: string; titulo: string | null }[]).filter((r) => r.titulo).map((r) => ({ id: r.id, titulo: r.titulo as string }));
  if (itens.length === 0) return { ok: true, n: 0 };
  await classificar(org.orgId, itens, cfg);
  await gerarSinaisDaOpiniao(db, org.orgId);
  await gerarSinaisAdversarios(db, org.orgId);
  return { ok: true, n: itens.length };
}

// ── Motor de sinais (escuta → Alertas + Decisão) ─────────────────────────────

/**
 * A partir das menções classificadas, gera ALERTAS (pico de negativo por tópico)
 * e SINAIS DE DECISÃO (pauta defensiva/ofensiva). Dedup por título em janela de
 * 7 dias. Chamado automaticamente após atualizarMencoes; também exposto p/ botão.
 */
async function gerarSinaisDaOpiniao(db: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<{ alertas: number; sinais: number }> {
  const desde = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data } = await db.from("intel_mentions").select("sentimento, topico").eq("organization_id", orgId).gte("created_at", desde).limit(3000);
  const rows = (data ?? []) as { sentimento: string | null; topico: string | null }[];
  const porTopico = new Map<string, { neg: number; pos: number }>();
  for (const r of rows) {
    if (!r.topico) continue;
    const t = porTopico.get(r.topico) ?? { neg: 0, pos: 0 };
    if (r.sentimento === "negativo") t.neg++;
    else if (r.sentimento === "positivo") t.pos++;
    porTopico.set(r.topico, t);
  }

  // Dedup: títulos de alertas abertos e de sinais recentes (7d).
  const desde7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [alAbertos, sinRec] = await Promise.all([
    db.from("pol_alerts").select("title").eq("organization_id", orgId).eq("status", "open").gte("created_at", desde7),
    db.from("pol_decision_signals").select("data").eq("organization_id", orgId).gte("created_at", desde7),
  ]);
  const titulosAlerta = new Set(((alAbertos.data ?? []) as { title: string }[]).map((a) => a.title));
  const titulosSinal = new Set(((sinRec.data ?? []) as { data: { title?: string } }[]).map((s) => s.data?.title).filter(Boolean));

  const novosAlertas: Record<string, unknown>[] = [];
  const novosSinais: Record<string, unknown>[] = [];
  for (const [topico, c] of porTopico) {
    if (c.neg >= 3) {
      const severity = c.neg >= 8 ? "high" : c.neg >= 5 ? "medium" : "low";
      const titA = `Menções negativas em alta: ${topico}`;
      if (!titulosAlerta.has(titA)) {
        novosAlertas.push({ organization_id: orgId, alert_type: "sentiment", severity, source_type: "opiniao_publica", title: titA, description: `${c.neg} menções negativas sobre "${topico}" nos últimos dias. Pauta sensível — avalie responder antes que escale.`, status: "open" });
      }
      const titS = `Responder sobre ${topico}`;
      if (!titulosSinal.has(titS)) {
        novosSinais.push({ organization_id: orgId, signal_type: "sentiment_shift", source: "opiniao_publica", severity, data: { title: titS, descricao: `${c.neg} menções negativas sobre ${topico} na imprensa/redes.`, acao: `Preparar nota/pauta sobre ${topico} e acionar lideranças da área. Monitorar a evolução.` } });
      }
    }
    if (c.pos >= 4) {
      const titS = `Capitalizar: ${topico}`;
      if (!titulosSinal.has(titS)) {
        novosSinais.push({ organization_id: orgId, signal_type: "media_coverage", source: "opiniao_publica", severity: "low", data: { title: titS, descricao: `${c.pos} menções positivas sobre ${topico}.`, acao: `Amplificar nas redes e, se for entrega sua, no Portal da Transparência.` } });
      }
    }
  }
  if (novosAlertas.length) await db.from("pol_alerts").insert(novosAlertas);
  if (novosSinais.length) await db.from("pol_decision_signals").insert(novosSinais);
  return { alertas: novosAlertas.length, sinais: novosSinais.length };
}

/** Gera sinais sob demanda (botão). */
export async function gerarSinais(): Promise<{ ok: boolean; alertas: number; sinais: number; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, alertas: 0, sinais: 0, erro: "Sessão inválida." };
  const db = await createClient();
  const r = await gerarSinaisDaOpiniao(db, org.orgId);
  return { ok: true, ...r };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listarMencoes(limit = 50): Promise<Mencao[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("intel_mentions")
    .select("id, canal, fonte, autor, titulo, url, publicado_em, polaridade, sentimento, topico, municipio, bairro, termo")
    .eq("organization_id", org.orgId)
    .order("publicado_em", { ascending: false, nullsFirst: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, canal: r.canal as string, fonte: (r.fonte as string | null) ?? null, autor: (r.autor as string | null) ?? null,
    titulo: (r.titulo as string | null) ?? null, url: (r.url as string | null) ?? null, publicadoEm: (r.publicado_em as string | null) ?? null,
    polaridade: (r.polaridade as number | null) ?? null, sentimento: (r.sentimento as string | null) ?? null, topico: (r.topico as string | null) ?? null,
    municipio: (r.municipio as string | null) ?? null, bairro: (r.bairro as string | null) ?? null, termo: (r.termo as string | null) ?? null,
  }));
}

export async function resumoOpiniao(): Promise<ResumoOpiniao> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  const vazio: ResumoOpiniao = { total: 0, positivos: 0, neutros: 0, negativos: 0, porDia: [], porCanal: [], topicos: [] };
  if (!org) return vazio;
  const db = await createClient();
  const { data } = await db
    .from("intel_mentions")
    .select("canal, sentimento, polaridade, topico, publicado_em")
    .eq("organization_id", org.orgId)
    .order("publicado_em", { ascending: false, nullsFirst: false })
    .limit(3000);
  const rows = (data ?? []) as { canal: string; sentimento: string | null; polaridade: number | null; topico: string | null; publicado_em: string | null }[];

  const resumo: ResumoOpiniao = { ...vazio, total: rows.length };
  const diaMap = new Map<string, { total: number; pos: number; neg: number }>();
  const canalMap = new Map<string, number>();
  const topMap = new Map<string, { total: number; soma: number }>();
  for (const r of rows) {
    if (r.sentimento === "positivo") resumo.positivos++;
    else if (r.sentimento === "negativo") resumo.negativos++;
    else resumo.neutros++;
    canalMap.set(r.canal, (canalMap.get(r.canal) ?? 0) + 1);
    if (r.topico) {
      const t = topMap.get(r.topico) ?? { total: 0, soma: 0 };
      t.total++; t.soma += r.polaridade ?? 0;
      topMap.set(r.topico, t);
    }
    if (r.publicado_em) {
      const dia = r.publicado_em.slice(0, 10);
      const d = diaMap.get(dia) ?? { total: 0, pos: 0, neg: 0 };
      d.total++; if (r.sentimento === "positivo") d.pos++; else if (r.sentimento === "negativo") d.neg++;
      diaMap.set(dia, d);
    }
  }
  resumo.porDia = [...diaMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([dia, v]) => ({ dia, ...v }));
  resumo.porCanal = [...canalMap.entries()].map(([canal, total]) => ({ canal, total })).sort((a, b) => b.total - a.total);
  resumo.topicos = [...topMap.entries()].map(([topico, v]) => ({ topico, total: v.total, polaridadeMedia: v.total ? v.soma / v.total : 0 })).sort((a, b) => b.total - a.total).slice(0, 10);
  return resumo;
}

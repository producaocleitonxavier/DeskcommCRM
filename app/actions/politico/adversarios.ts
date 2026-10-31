"use server";

/**
 * Motor de Adversários. O operador cadastra os oponentes (nome); o motor varre
 * as menções captadas (intel_mentions) procurando o nome deles e gera SINAIS
 * (pol_opponent_signals, tipo media_mention) + atualiza o threat_score/risco de
 * cada um pela presença na mídia. Alimenta a aba Adversários do Monitoramento.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg, orgSeAoMenos } from "@/lib/auth/server";
import { resolveIgCreds, type IgCredentials } from "@/lib/channels/instagram/credentials";
import { businessDiscovery } from "@/lib/channels/instagram/business-discovery";
import { lerIdentidadeDoMandato } from "@/lib/politico/identidade-do-mandato";

// ── Dimensão ELEITORAL do adversário (TSE) — a 3ª perna do score de ameaça ────
// Além de Mídia (menções) e Digital (Instagram), medimos a FORÇA ELEITORAL real:
// a maior votação do adversário no SEU município (qualquer eleição seedada) + se
// foi eleito/suplente. É o dado que o concorrente (SAM) não cruza com o resto.
export interface DimensaoEleitoral {
  votosMunicipio: number;
  situacao: string | null;
  statusLabel: string; // "eleito" | "suplente" | "não eleito" | ""
  partido: string | null;
  cargo: string | null;
  ano: number | null;
  lugar: string;
}

function statusCurtoTSE(s: string | null | undefined): string {
  const x = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  if (x.startsWith("ELEITO")) return "eleito";
  if (x === "SUPLENTE") return "suplente";
  if (x === "NAO ELEITO") return "não eleito";
  return "";
}
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Para os nomes de adversários dados, devolve a maior votação de cada um no
 * município do mandato (via intel_candidatos ∪ intel_cand_mun) + status TSE.
 * Chave do retorno = nome em minúsculas. Degrada liso (mapa vazio) sem cidade,
 * sem match ou sem dados TSE. Casa por TODOS os tokens do nome (defensivo).
 */
export async function dimensaoEleitoralDosAdversarios(nomes: string[]): Promise<Record<string, DimensaoEleitoral>> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return {};
  const limpos = [...new Set(nomes.map((n) => (n ?? "").trim()).filter((n) => n.length >= 4))];
  if (limpos.length === 0) return {};

  const db = await createClient();
  const identidade = await lerIdentidadeDoMandato(db, org.orgId);
  const cidade = identidade.cidade?.trim();
  if (!cidade) return {};
  const { data: mun } = await db.from("intel_municipios").select("tse_code, nome").ilike("nome", cidade).limit(1).maybeSingle();
  const cdMun = (mun as { tse_code?: string } | null)?.tse_code;
  const lugar = (mun as { nome?: string } | null)?.nome ?? cidade;
  if (!cdMun) return {};

  // Busca ampla por nome (ilike por tokens); a filtragem exata (todos os tokens,
  // sem acento) é feita no JS logo abaixo.
  const orFilter = limpos
    .map((n) => `nome_urna.ilike.%${n.split(/\s+/).filter(Boolean).join("%")}%`)
    .join(",");
  const { data: cands } = await db
    .from("intel_candidatos")
    .select("election_id, sq_candidato, nome_urna, partido_sigla, situacao")
    .or(orFilter)
    .limit(300);
  const candidatos = (cands ?? []) as { election_id: number; sq_candidato: number; nome_urna: string; partido_sigla: string | null; situacao: string | null }[];
  if (candidatos.length === 0) return {};

  const sqs = [...new Set(candidatos.map((c) => Number(c.sq_candidato)))];
  const { data: cm } = await db
    .from("intel_cand_mun")
    .select("election_id, sq_candidato, votos")
    .eq("cd_municipio", Number(cdMun))
    .in("sq_candidato", sqs)
    .limit(3000);
  const votosMap = new Map<string, number>();
  for (const r of (cm ?? []) as { election_id: number; sq_candidato: number; votos: number }[]) votosMap.set(`${r.election_id}:${r.sq_candidato}`, Number(r.votos));

  const { data: els } = await db.from("intel_elections").select("id, ano, cargo");
  const elMap = new Map<number, { ano: number; cargo: string }>();
  for (const e of (els ?? []) as { id: number; ano: number; cargo: string }[]) elMap.set(e.id, { ano: e.ano, cargo: e.cargo });

  const out: Record<string, DimensaoEleitoral> = {};
  for (const nome of limpos) {
    const tokens = semAcento(nome).split(/\s+/).filter(Boolean);
    const matches = candidatos.filter((c) => {
      const nm = semAcento(c.nome_urna ?? "");
      return tokens.every((t) => nm.includes(t));
    });
    if (matches.length === 0) continue;
    let melhor: (typeof matches)[number] | null = null;
    let melhorVotos = -1;
    for (const m of matches) {
      const v = votosMap.get(`${m.election_id}:${m.sq_candidato}`) ?? 0;
      if (v > melhorVotos) { melhorVotos = v; melhor = m; }
    }
    if (!melhor) continue;
    const el = elMap.get(melhor.election_id);
    out[nome.toLowerCase()] = {
      votosMunicipio: Math.max(0, melhorVotos),
      situacao: melhor.situacao,
      statusLabel: statusCurtoTSE(melhor.situacao),
      partido: melhor.partido_sigla,
      cargo: el?.cargo ?? null,
      ano: el?.ano ?? null,
      lugar,
    };
  }
  return out;
}

/** Credenciais do Instagram da org (channel_sessions). null = Instagram não conectado. */
async function credsIgDaOrg(orgId: string): Promise<IgCredentials | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("channel_sessions")
    .select("ig_business_account_id")
    .eq("organization_id", orgId)
    .eq("provider", "instagram")
    .not("ig_business_account_id", "is", null)
    .limit(1)
    .maybeSingle();
  const baid = (data as { ig_business_account_id?: string } | null)?.ig_business_account_id;
  if (!baid) return null;
  return resolveIgCreds(admin, { organizationId: orgId, businessAccountId: baid });
}

/**
 * Monitora o Instagram dos adversários cadastrados com @ (business_discovery):
 * atualiza seguidores + engajamento e registra o post mais viral como sinal.
 * "Aguardando conexão": sem Instagram conectado, retorna semConexao=true.
 */
export async function atualizarAdversariosInstagram(): Promise<{ ok: boolean; n: number; erro?: string; semConexao?: boolean }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, n: 0, erro: "Sessão inválida." };
  const creds = await credsIgDaOrg(org.orgId);
  if (!creds) return { ok: false, n: 0, semConexao: true, erro: "Conecte o Instagram (Canais › Instagram) para ler as redes dos adversários. O cadastro do @ já fica salvo." };

  const db = await createClient();
  const { data: opps } = await db.from("pol_opponents").select("id, name, username").eq("organization_id", org.orgId).eq("active", true).not("username", "is", null).limit(100);
  const lista = (opps ?? []) as { id: string; name: string; username: string }[];

  const desde7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: sinRec } = await db.from("pol_opponent_signals").select("metadata").eq("organization_id", org.orgId).gte("created_at", desde7);
  const permsVistos = new Set(((sinRec ?? []) as { metadata: { permalink?: string } }[]).map((s) => s.metadata?.permalink).filter(Boolean));

  let n = 0;
  const sinais: Record<string, unknown>[] = [];
  for (const o of lista) {
    const bd = await businessDiscovery(creds, o.username);
    if (!bd) continue;
    await db.from("pol_opponents").update({ followers: bd.followers, engagement_rate: bd.engajamento, platform: "instagram" }).eq("id", o.id).eq("organization_id", org.orgId);
    n++;
    const top = [...bd.midias].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))[0];
    if (top && top.permalink && !permsVistos.has(top.permalink)) {
      const eng = top.likes + top.comments;
      const taxa = bd.followers > 0 ? eng / bd.followers : 0;
      const sev = taxa > 0.05 ? "high" : taxa > 0.02 ? "medium" : "low";
      sinais.push({
        organization_id: org.orgId, opponent_id: o.id, signal_type: "viral_content", severity: sev,
        description: `Post de @${o.username}: ${eng.toLocaleString("pt-BR")} de engajamento (${top.likes.toLocaleString("pt-BR")} curtidas · ${top.comments.toLocaleString("pt-BR")} comentários)`,
        metadata: { permalink: top.permalink, timestamp: top.timestamp, followers: bd.followers },
      });
    }
  }
  if (sinais.length) await db.from("pol_opponent_signals").insert(sinais);
  return { ok: true, n };
}

export interface SinalAdversario {
  id: string;
  adversario: string;
  descricao: string;
  severity: string;
  sentimento: string | null;
  url: string | null;
  createdAt: string;
}

export async function registrarAdversario(nome: string, handle?: string): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida." };
  if (!nome.trim()) return { ok: false, erro: "Informe o nome do adversário." };
  const username = (handle ?? "").trim().replace(/^@+/, "").toLowerCase() || null; // @ do Instagram, sem o @
  const db = await createClient();
  const { error } = await db.from("pol_opponents").insert({
    organization_id: org.orgId,
    name: nome.trim(),
    platform: username ? "instagram" : "website",
    username,
    risk_level: "medium",
    threat_score: 0,
    active: true,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

export async function removerAdversario(id: string): Promise<{ ok: boolean }> {
  // Exclusão = Gerente+ (defesa no servidor, além da tela de Inteligência já ser manager).
  const org = await orgSeAoMenos("manager");
  if (!org) return { ok: false };
  const db = await createClient();
  await db.from("pol_opponents").delete().eq("id", id).eq("organization_id", org);
  return { ok: true };
}

/** Varre as menções e gera sinais para cada adversário cadastrado. Helper + ação. */
export async function gerarSinaisAdversarios(db: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<number> {
  const { data: opps } = await db.from("pol_opponents").select("id, name").eq("organization_id", orgId).eq("active", true).limit(100);
  const oponentes = ((opps ?? []) as { id: string; name: string }[]).filter((o) => (o.name ?? "").trim().length >= 4);
  if (oponentes.length === 0) return 0;

  const desde14 = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: mens } = await db.from("intel_mentions").select("titulo, sentimento, url, publicado_em").eq("organization_id", orgId).gte("created_at", desde14).limit(2000);
  const mencoes = (mens ?? []) as { titulo: string | null; sentimento: string | null; url: string | null; publicado_em: string | null }[];

  // Dedup: descrições já registradas por adversário nos últimos 7d.
  const desde7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: sinaisRec } = await db.from("pol_opponent_signals").select("opponent_id, description").eq("organization_id", orgId).gte("created_at", desde7);
  const jaRegistrado = new Set(((sinaisRec ?? []) as { opponent_id: string; description: string }[]).map((s) => `${s.opponent_id}::${s.description}`));

  const novos: Record<string, unknown>[] = [];
  const contagem = new Map<string, number>();
  for (const o of oponentes) {
    const alvo = o.name.toLowerCase();
    for (const m of mencoes) {
      const titulo = (m.titulo ?? "").trim();
      if (!titulo || !titulo.toLowerCase().includes(alvo)) continue;
      const chave = `${o.id}::${titulo}`;
      if (jaRegistrado.has(chave)) continue;
      jaRegistrado.add(chave);
      const severity = m.sentimento === "negativo" ? "high" : m.sentimento === "positivo" ? "low" : "medium";
      novos.push({
        organization_id: orgId, opponent_id: o.id, signal_type: "media_mention", severity,
        description: titulo, metadata: { url: m.url, publicado_em: m.publicado_em, sentimento: m.sentimento },
      });
      contagem.set(o.id, (contagem.get(o.id) ?? 0) + 1);
    }
  }
  if (novos.length) await db.from("pol_opponent_signals").insert(novos);

  // Atualiza threat_score e risco pela presença total em sinais (14d).
  const { data: todosSinais } = await db.from("pol_opponent_signals").select("opponent_id").eq("organization_id", orgId).gte("created_at", desde14);
  const totalPorOpp = new Map<string, number>();
  for (const s of (todosSinais ?? []) as { opponent_id: string }[]) totalPorOpp.set(s.opponent_id, (totalPorOpp.get(s.opponent_id) ?? 0) + 1);
  for (const o of oponentes) {
    const n = totalPorOpp.get(o.id) ?? 0;
    const risk = n >= 10 ? "critical" : n >= 5 ? "high" : n >= 2 ? "medium" : "low";
    await db.from("pol_opponents").update({ threat_score: n, risk_level: risk }).eq("id", o.id).eq("organization_id", orgId);
  }
  return novos.length;
}

export async function gerarSinaisAdversariosAcao(): Promise<{ ok: boolean; n: number; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, n: 0, erro: "Sessão inválida." };
  const db = await createClient();
  const n = await gerarSinaisAdversarios(db, org.orgId);
  return { ok: true, n };
}

export async function listarSinaisAdversarios(limit = 30): Promise<SinalAdversario[]> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const db = await createClient();
  const { data } = await db
    .from("pol_opponent_signals")
    .select("id, description, severity, metadata, created_at, pol_opponents(name)")
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((s) => {
    const meta = (s.metadata ?? {}) as { url?: string; permalink?: string; sentimento?: string };
    const opp = s.pol_opponents as { name?: string } | null;
    return {
      id: String(s.id),
      adversario: opp?.name ?? "—",
      descricao: String(s.description ?? ""),
      severity: String(s.severity ?? "medium"),
      sentimento: meta.sentimento ?? null,
      url: meta.url ?? meta.permalink ?? null,
      createdAt: String(s.created_at),
    };
  });
}

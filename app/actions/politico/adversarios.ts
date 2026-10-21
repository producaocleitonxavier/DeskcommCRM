"use server";

/**
 * Motor de Adversários. O operador cadastra os oponentes (nome); o motor varre
 * as menções captadas (intel_mentions) procurando o nome deles e gera SINAIS
 * (pol_opponent_signals, tipo media_mention) + atualiza o threat_score/risco de
 * cada um pela presença na mídia. Alimenta a aba Adversários do Monitoramento.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export interface SinalAdversario {
  id: string;
  adversario: string;
  descricao: string;
  severity: string;
  sentimento: string | null;
  url: string | null;
  createdAt: string;
}

export async function registrarAdversario(nome: string): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida." };
  if (!nome.trim()) return { ok: false, erro: "Informe o nome do adversário." };
  const db = await createClient();
  const { error } = await db.from("pol_opponents").insert({
    organization_id: org.orgId,
    name: nome.trim(),
    platform: "website",
    risk_level: "medium",
    threat_score: 0,
    active: true,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

export async function removerAdversario(id: string): Promise<{ ok: boolean }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false };
  const db = await createClient();
  await db.from("pol_opponents").delete().eq("id", id).eq("organization_id", org.orgId);
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
    const meta = (s.metadata ?? {}) as { url?: string; sentimento?: string };
    const opp = s.pol_opponents as { name?: string } | null;
    return {
      id: String(s.id),
      adversario: opp?.name ?? "—",
      descricao: String(s.description ?? ""),
      severity: String(s.severity ?? "medium"),
      sentimento: meta.sentimento ?? null,
      url: meta.url ?? null,
      createdAt: String(s.created_at),
    };
  });
}

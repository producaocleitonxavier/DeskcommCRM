/**
 * /app/politico/locais/inteligencia — Inteligência de Eventos (War Room 2.0, Fase 2D)
 *
 * Painel de leitura do funil de eventos: transforma os cadastros feitos em escolas,
 * igrejas e praças em INTELIGÊNCIA TERRITORIAL — onde está o público quente (por zona
 * eleitoral), quais locais mais capturam, e a cadência de eventos no tempo.
 *
 * Tudo read-only, agregado no servidor a partir de pol_locais × pol_events ×
 * pol_event_attendance. Não depende do número dedicado (isso é a máquina de envio, 2C
 * Fatia 2). Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import InteligenciaClient, { type ZonaRow, type LocalRow, type MesRow } from "./_inteligencia-client";

export const dynamic = "force-dynamic";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function InteligenciaEventosPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  const [{ data: locaisData }, { data: eventosData }, { data: presencaData }] = await Promise.all([
    db
      .from("pol_locais")
      .select("id, nome, tipo, bairro, cidade, zona_eleitoral")
      .eq("organization_id", org.orgId)
      .limit(500),
    db
      .from("pol_events")
      .select("id, local_id, event_date")
      .eq("organization_id", org.orgId)
      .not("local_id", "is", null)
      .limit(3000),
    db
      .from("pol_event_attendance")
      .select("event_id, contact_id")
      .eq("organization_id", org.orgId)
      .limit(10000),
  ]);

  const locais = (locaisData ?? []) as {
    id: string;
    nome: string;
    tipo: string;
    bairro: string | null;
    cidade: string | null;
    zona_eleitoral: string | null;
  }[];
  const eventos = (eventosData ?? []) as { id: string; local_id: string; event_date: string | null }[];
  const presenca = (presencaData ?? []) as { event_id: string; contact_id: string }[];

  // Índices: evento -> local, local -> metadados.
  const localPorId = new Map(locais.map((l) => [l.id, l]));
  const localDoEvento = new Map(eventos.map((e) => [e.id, e.local_id]));

  // Pessoas distintas por local e por zona (via presença -> evento -> local).
  const pessoasPorLocal = new Map<string, Set<string>>();
  const pessoasPorZona = new Map<string, Set<string>>();
  for (const p of presenca) {
    const localId = localDoEvento.get(p.event_id);
    if (!localId) continue;
    if (!pessoasPorLocal.has(localId)) pessoasPorLocal.set(localId, new Set());
    pessoasPorLocal.get(localId)!.add(p.contact_id);

    const local = localPorId.get(localId);
    const zona = local?.zona_eleitoral?.trim() || "Sem zona";
    if (!pessoasPorZona.has(zona)) pessoasPorZona.set(zona, new Set());
    pessoasPorZona.get(zona)!.add(p.contact_id);
  }

  // Eventos e locais por zona.
  const eventosPorZona = new Map<string, number>();
  const locaisPorZona = new Map<string, Set<string>>();
  for (const e of eventos) {
    const local = localPorId.get(e.local_id);
    const zona = local?.zona_eleitoral?.trim() || "Sem zona";
    eventosPorZona.set(zona, (eventosPorZona.get(zona) ?? 0) + 1);
    if (!locaisPorZona.has(zona)) locaisPorZona.set(zona, new Set());
    locaisPorZona.get(zona)!.add(e.local_id);
  }

  // Eventos por mês (últimos 12 meses, incluindo vazios para dar a cadência).
  const agora = new Date();
  const baldes: { chave: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    baldes.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, label: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` });
  }
  const contagemMes = new Map<string, number>();
  for (const e of eventos) {
    if (!e.event_date) continue;
    const d = new Date(e.event_date);
    if (Number.isNaN(d.getTime())) continue;
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    contagemMes.set(chave, (contagemMes.get(chave) ?? 0) + 1);
  }
  const meses: MesRow[] = baldes.map((b) => ({ mes: b.label, eventos: contagemMes.get(b.chave) ?? 0 }));

  // Linhas por zona (ordenadas por público).
  const zonas: ZonaRow[] = [...pessoasPorZona.keys()]
    .map((zona) => ({
      zona,
      pessoas: pessoasPorZona.get(zona)?.size ?? 0,
      eventos: eventosPorZona.get(zona) ?? 0,
      locais: locaisPorZona.get(zona)?.size ?? 0,
    }))
    .sort((a, b) => b.pessoas - a.pessoas);

  // Top locais por público.
  const topLocais: LocalRow[] = locais
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      bairro: l.bairro,
      zona: l.zona_eleitoral?.trim() || null,
      pessoas: pessoasPorLocal.get(l.id)?.size ?? 0,
    }))
    .filter((l) => l.pessoas > 0)
    .sort((a, b) => b.pessoas - a.pessoas)
    .slice(0, 12);

  const totalPessoas = [...pessoasPorLocal.values()].reduce((s, set) => s + set.size, 0);
  const zonasComPublico = zonas.filter((z) => z.zona !== "Sem zona" && z.pessoas > 0).length;

  const kpis = {
    eventos: eventos.length,
    pessoas: totalPessoas,
    zonas: zonasComPublico,
    locais: topLocais.length,
  };

  return <InteligenciaClient kpis={kpis} zonas={zonas} topLocais={topLocais} meses={meses} />;
}

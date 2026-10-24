/**
 * /app/politico/locais — Locais & Eventos (War Room 2.0, Fase 2)
 *
 * Server: auth + fetch (pol_locais) + contagem de eventos e pessoas por local.
 * O Local (escola, igreja, associação...) agrupa os eventos e os cadastros feitos
 * ali. Visual em ./_locais-client. Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import LocaisClient, { type LocalItem } from "./_locais-client";

export const dynamic = "force-dynamic";

export default async function LocaisPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  const [{ data: locaisData }, { data: eventosData }, { data: presencaData }] = await Promise.all([
    db
      .from("pol_locais")
      .select("id, nome, tipo, bairro, cidade, zona_eleitoral, ativo")
      .eq("organization_id", org.orgId)
      .order("created_at", { ascending: false })
      .limit(300),
    db.from("pol_events").select("id, local_id").eq("organization_id", org.orgId).not("local_id", "is", null).limit(2000),
    db.from("pol_event_attendance").select("event_id, contact_id").eq("organization_id", org.orgId).limit(5000),
  ]);

  // evento -> local
  const eventoLocal = new Map<string, string>();
  const eventosPorLocal = new Map<string, number>();
  for (const e of (eventosData ?? []) as { id: string; local_id: string }[]) {
    eventoLocal.set(e.id, e.local_id);
    eventosPorLocal.set(e.local_id, (eventosPorLocal.get(e.local_id) ?? 0) + 1);
  }
  // pessoas distintas por local (via presença -> evento -> local)
  const pessoasPorLocal = new Map<string, Set<string>>();
  for (const p of (presencaData ?? []) as { event_id: string; contact_id: string }[]) {
    const localId = eventoLocal.get(p.event_id);
    if (!localId) continue;
    if (!pessoasPorLocal.has(localId)) pessoasPorLocal.set(localId, new Set());
    pessoasPorLocal.get(localId)!.add(p.contact_id);
  }

  const locais: LocalItem[] = ((locaisData ?? []) as Record<string, unknown>[]).map((l) => {
    const id = String(l.id);
    return {
      id,
      nome: String(l.nome ?? ""),
      tipo: String(l.tipo ?? "outro"),
      bairro: (l.bairro as string | null) ?? null,
      cidade: (l.cidade as string | null) ?? null,
      zona: (l.zona_eleitoral as string | null) ?? null,
      ativo: Boolean(l.ativo),
      nEventos: eventosPorLocal.get(id) ?? 0,
      nPessoas: pessoasPorLocal.get(id)?.size ?? 0,
    };
  });

  const kpis = {
    locais: locais.length,
    eventos: [...eventosPorLocal.values()].reduce((a, b) => a + b, 0),
    pessoas: locais.reduce((a, l) => a + l.nPessoas, 0),
  };

  return <LocaisClient locais={locais} kpis={kpis} />;
}

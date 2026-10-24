/**
 * /app/politico/locais/[id] — ficha do Local (o "card da escola"): info, eventos
 * realizados ali e as pessoas cadastradas. Cadastro e novo evento no client via
 * server actions. Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import LocalDetalheClient, {
  type LocalDetalhe,
  type EventoDoLocal,
  type PessoaRegistrada,
} from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function LocalDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  const { data: localData } = await db
    .from("pol_locais")
    .select("id, nome, tipo, bairro, cidade, uf, cep, zona_eleitoral, endereco, ativo")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!localData) redirect("/app/politico/locais");
  const l = localData as Record<string, unknown>;

  const { data: eventosData } = await db
    .from("pol_events")
    .select("id, title, theme, type, event_date, estimated_audience")
    .eq("organization_id", org.orgId)
    .eq("local_id", id)
    .order("event_date", { ascending: false, nullsFirst: false });

  const eventos = (eventosData ?? []) as Record<string, unknown>[];
  const eventoIds = eventos.map((e) => String(e.id));
  const tituloPorEvento = new Map(eventos.map((e) => [String(e.id), String(e.theme ?? e.title ?? "Evento")]));

  let presenca: Record<string, unknown>[] = [];
  if (eventoIds.length > 0) {
    const { data: presData } = await db
      .from("pol_event_attendance")
      .select("event_id, contact_id, role, notes, checked_in_at, contacts(name, phone_number)")
      .eq("organization_id", org.orgId)
      .in("event_id", eventoIds)
      .order("checked_in_at", { ascending: false, nullsFirst: false });
    presenca = (presData ?? []) as Record<string, unknown>[];
  }

  const pessoasPorEvento = new Map<string, number>();
  for (const p of presenca) {
    const ev = String(p.event_id);
    pessoasPorEvento.set(ev, (pessoasPorEvento.get(ev) ?? 0) + 1);
  }

  const local: LocalDetalhe = {
    id: String(l.id),
    nome: String(l.nome ?? ""),
    tipo: String(l.tipo ?? "outro"),
    bairro: (l.bairro as string | null) ?? null,
    cidade: (l.cidade as string | null) ?? null,
    uf: (l.uf as string | null) ?? null,
    cep: (l.cep as string | null) ?? null,
    zona: (l.zona_eleitoral as string | null) ?? null,
    endereco: (l.endereco as string | null) ?? null,
    ativo: Boolean(l.ativo),
  };

  const eventosDTO: EventoDoLocal[] = eventos.map((e) => ({
    id: String(e.id),
    titulo: String(e.theme ?? e.title ?? "Evento"),
    tipo: String(e.type ?? "outro"),
    data: (e.event_date as string | null) ?? null,
    publicoEstimado: (e.estimated_audience as number | null) ?? null,
    nPessoas: pessoasPorEvento.get(String(e.id)) ?? 0,
  }));

  const pessoasDTO: PessoaRegistrada[] = presenca.map((p) => {
    const c = (p.contacts ?? null) as { name?: string | null; phone_number?: string | null } | null;
    return {
      contactId: String(p.contact_id),
      nome: c?.name ?? "(sem nome)",
      telefone: c?.phone_number ?? null,
      eventoId: String(p.event_id),
      eventoTitulo: tituloPorEvento.get(String(p.event_id)) ?? "Evento",
      relacao: (p.notes as string | null) ?? null,
      checkedInAt: (p.checked_in_at as string | null) ?? null,
    };
  });

  return <LocalDetalheClient local={local} eventos={eventosDTO} pessoas={pessoasDTO} />;
}

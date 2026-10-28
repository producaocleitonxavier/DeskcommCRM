/**
 * /app/politico/demandas/[id] — detalhe e edição de uma demanda (Gabinete).
 *
 * Server component: auth + busca da demanda (com cidadão), membros (assessores)
 * e eventos. A interação (editar, transições de estado, encaminhamento) vive em
 * ./_detalhe-client.
 *
 * Acesso: manager+
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";
import { lerVozConfig, vozArmada } from "@/lib/voz/config";
import DetalheDemandaClient, { type DemandaDetalhe } from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function DemandaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [demRes, membrosRes, evtRes] = await Promise.all([
    db
      .from("demandas")
      .select(
        "id, assunto, estado, origem, pol_tipo, pol_prioridade, pol_orgao_destino, pol_encaminhamento_ia, pol_oficio_rotulo, pol_oficio_destinatario, pol_oficio_assunto, pol_municipio, pol_territory_id, pol_lideranca_id, dono_kind, dono_user_id, pol_assessor_nome, aberta_em, prazo_em, desfecho, fechada_em, created_at, updated_at, contacts(name, phone_number)",
      )
      .eq("organization_id", org.orgId)
      .eq("id", id)
      .maybeSingle(),
    db.from("user_organizations").select("user_id, role").eq("organization_id", org.orgId).is("revoked_at", null),
    db
      .from("pol_demanda_eventos")
      .select("id, tipo, descricao, created_at")
      .eq("organization_id", org.orgId)
      .eq("demanda_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  if (!demRes.data) notFound();

  // Voz do Mandato armada? (liga a opção "incluir recado em áudio" no aviso.)
  const vozOk = vozArmada(await lerVozConfig(db, org.orgId));

  // Gabinete usa linha "Assunto:" no ofício? (liga o campo na tela.)
  const { data: gabRow } = await db
    .from("pol_gabinete_config")
    .select("oficio_mostrar_assunto")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const mostrarAssuntoOficio = (gabRow?.oficio_mostrar_assunto as boolean | null) === true;

  const membros = (membrosRes.data ?? []) as { user_id: string; role: string }[];
  const nomes = await nomesDosAtendentes(membros.map((m) => m.user_id));
  const assessores = membros
    .map((m) => ({ id: m.user_id, nome: nomes.get(m.user_id) ?? `${m.user_id.slice(0, 8)} · ${m.role}` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const eventos = ((evtRes.data ?? []) as { id: string; tipo: string; descricao: string | null; created_at: string }[]).map((e) => ({
    id: e.id,
    tipo: e.tipo,
    descricao: e.descricao,
    created_at: e.created_at,
  }));

  return (
    <DetalheDemandaClient
      demanda={demRes.data as unknown as DemandaDetalhe}
      assessores={assessores}
      eventos={eventos}
      vozArmada={vozOk}
      mostrarAssuntoOficio={mostrarAssuntoOficio}
    />
  );
}

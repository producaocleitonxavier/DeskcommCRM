/**
 * /app/captacao-qr/[id]/evento — "Modo Evento": tela cheia de UM ponto de captação,
 * pensada para o assessor ERGUER O CELULAR no evento e as pessoas escanearem.
 * QR grande + contador ao vivo + ligar/pausar. Acesso: manager+.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import EventoClient from "./_evento-client";

export const dynamic = "force-dynamic";

export default async function ModoEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) redirect("/app/politico");

  const { id } = await params;
  const db = await createClient();

  const { data: o } = await db
    .from("pol_qr_origens")
    .select("id, nome, codigo, ativo")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!o) redirect("/app/captacao-qr");
  const ponto = o as { id: string; nome: string; codigo: string; ativo: boolean };

  // Contagem inicial de cadastros deste ponto (o cliente atualiza ao vivo).
  const { count } = await db
    .from("pol_qr_cadastros")
    .select("id", { count: "exact", head: true })
    .eq("origem_id", id);

  const { data: cfg } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const ident = (cfg ?? null) as { nome_parlamentar: string | null; cargo: string | null } | null;

  return (
    <EventoClient
      ponto={ponto}
      inicial={count ?? 0}
      nomeParlamentar={ident?.nome_parlamentar ?? null}
      cargo={ident?.cargo ?? null}
    />
  );
}

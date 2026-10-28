/**
 * /app/politico/liderancas/[id] — detalhe e edição de uma liderança (Gabinete).
 *
 * Server component: auth + busca da liderança (com contato) e territórios para
 * o select de edição. Interação em ./_detalhe-client.
 *
 * Acesso: manager+
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { lerVozConfig, vozArmada } from "@/lib/voz/config";
import DetalheLiderancaClient, { type LiderancaDetalhe } from "./_detalhe-client";

export const dynamic = "force-dynamic";

export default async function LiderancaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [lidRes, terrRes, pessoasRes, eventosRes] = await Promise.all([
    db
      .from("pol_liderancas")
      .select(
        "id, nome, apelido, cargo, tipo, whatsapp, email, instagram, aniversario, territory_id, cidade, bairro, zona_eleitoral, leads_mobilizados, eventos_organizados, ultimo_contato_em, nivel_engajamento, status, observacoes, foto_path, contact_id, contacts(name, phone_number)",
      )
      .eq("organization_id", org.orgId)
      .eq("id", id)
      .maybeSingle(),
    db.from("pol_territories").select("id, name, state_code").eq("organization_id", org.orgId).order("name").limit(600),
    // Contagens ao vivo para esta liderança.
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("pol_lideranca_id", id),
    db.from("pol_agenda").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("lideranca_id", id).eq("tipo", "evento"),
  ]);

  if (!lidRes.data) notFound();

  const territorios = ((terrRes.data ?? []) as { id: string; name: string; state_code: string | null }[]).map((t) => ({
    id: t.id,
    nome: t.state_code ? `${t.name} · ${t.state_code}` : t.name,
  }));

  const base = lidRes.data as unknown as LiderancaDetalhe & { foto_path: string | null };
  let fotoUrl: string | null = null;
  if (base.foto_path) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: signed } = await createAdminClient().storage.from("gabinete-liderancas").createSignedUrl(base.foto_path, 60 * 60);
    fotoUrl = signed?.signedUrl ?? null;
  }
  const lideranca = {
    ...base,
    leads_mobilizados: pessoasRes.count ?? 0,
    eventos_organizados: eventosRes.count ?? 0,
  };

  const vozOk = vozArmada(await lerVozConfig(db, org.orgId));
  const { data: gabNome } = await db.from("pol_gabinete_config").select("nome_parlamentar").eq("organization_id", org.orgId).maybeSingle();
  const politicoNome = ((gabNome?.nome_parlamentar as string | null) ?? "").trim() || null;

  return <DetalheLiderancaClient lideranca={lideranca} fotoUrl={fotoUrl} territorios={territorios} vozArmada={vozOk} politicoNome={politicoNome} />;
}

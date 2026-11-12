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
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";

export default async function LiderancaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirAcessoPolitico("liderancas");
  const { id } = await params;
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [lidRes, pessoasRes, eventosRes] = await Promise.all([
    db
      .from("pol_liderancas")
      .select(
        "id, nome, apelido, cargo, tipo, whatsapp, email, instagram, aniversario, territory_id, cidade, bairro, zona_eleitoral, leads_mobilizados, eventos_organizados, ultimo_contato_em, nivel_engajamento, status, observacoes, foto_path, contact_id, contacts(name, phone_number)",
      )
      .eq("organization_id", org.orgId)
      .eq("id", id)
      .maybeSingle(),
    // Pessoas indicadas por esta liderança (quem entrou pelo link de captação) —
    // com nome, para listar e linkar na ficha. count = total.
    db.from("pol_leads").select("id, contact_id, contacts!contact_id(name)", { count: "exact" }).eq("organization_id", org.orgId).eq("pol_lideranca_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("pol_events").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("lideranca_id", id),
  ]);

  if (!lidRes.data) notFound();

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

  // Pessoas que entraram pelo link desta liderança — nome + id do lead (clicável).
  const indicadas = ((pessoasRes.data ?? []) as { id: string; contacts: { name: string | null } | { name: string | null }[] | null }[]).map((r) => {
    const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    return { leadId: r.id, nome: (c?.name ?? "").trim() || "Sem nome" };
  });

  const vozOk = vozArmada(await lerVozConfig(db, org.orgId));
  const { data: gabNome } = await db.from("pol_gabinete_config").select("nome_parlamentar").eq("organization_id", org.orgId).maybeSingle();
  const politicoNome = ((gabNome?.nome_parlamentar as string | null) ?? "").trim() || null;

  return <DetalheLiderancaClient lideranca={lideranca} fotoUrl={fotoUrl} vozArmada={vozOk} politicoNome={politicoNome} indicadas={indicadas} />;
}

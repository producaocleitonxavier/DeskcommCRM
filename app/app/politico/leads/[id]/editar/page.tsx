/**
 * /app/politico/leads/[id]/editar — Edição da ficha de uma pessoa (War Room 2.0)
 *
 * Carrega o pol_lead + contato e entrega ao formulário de edição, que grava via
 * PATCH /api/v1/contacts/[id] (dados pessoais) e PATCH /api/v1/pol-leads/[id]
 * (classificação política).
 *
 * Acesso: manager+
 */

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import EditarLeadForm, { type LeadParaEdicao } from "./form";

export const dynamic = "force-dynamic";

export default async function EditarLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const { id } = await params;
  const db = await createClient();

  const { data: lead } = await db
    .from("pol_leads")
    .select(
      "id, contact_id, support_level, temperature, zona_eleitoral, secao_eleitoral, community_role, leader_potential, territory_id",
    )
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();
  const l = lead as {
    id: string;
    contact_id: string;
    support_level: string;
    temperature: string;
    zona_eleitoral: string | null;
    secao_eleitoral: string | null;
    community_role: string | null;
    leader_potential: boolean | null;
    territory_id: string | null;
  };

  const [{ data: contact }, { data: territorios }] = await Promise.all([
    db
      .from("contacts")
      .select("id, name, phone_number, email, custom_fields")
      .eq("id", l.contact_id)
      .maybeSingle(),
    db.from("pol_territories").select("id, name, type").eq("organization_id", org.orgId).order("name"),
  ]);

  if (!contact) notFound();
  const c = contact as {
    id: string;
    name: string | null;
    phone_number: string | null;
    email: string | null;
    custom_fields: Record<string, unknown> | null;
  };

  const cf = (c.custom_fields ?? {}) as Record<string, unknown>;
  const inicial: LeadParaEdicao = {
    leadId: l.id,
    contactId: c.id,
    nome: c.name ?? "",
    telefone: c.phone_number ?? "",
    email: c.email ?? "",
    cidade: typeof cf.cidade === "string" ? cf.cidade : "",
    bairro: typeof cf.bairro === "string" ? cf.bairro : "",
    profissao: typeof cf.profissao === "string" ? cf.profissao : "",
    customFields: cf,
    support_level: l.support_level,
    temperature: l.temperature,
    zona_eleitoral: l.zona_eleitoral ?? "",
    secao_eleitoral: l.secao_eleitoral ?? "",
    community_role: l.community_role ?? "",
    leader_potential: !!l.leader_potential,
    territory_id: l.territory_id ?? "",
  };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-7 space-y-[18px]">
      <header className="wr-card p-6 sm:p-7">
        <h1 className="font-heading text-[28px] sm:text-[32px] font-bold leading-tight">Editar pessoa</h1>
        <p className="mt-1.5 text-base" style={{ color: "var(--color-text-muted)" }}>
          Ajuste os dados de contato e a classificação política. As mudanças valem na hora.
        </p>
      </header>

      <EditarLeadForm inicial={inicial} territorios={(territorios ?? []) as { id: string; name: string; type: string }[]} />
    </div>
  );
}

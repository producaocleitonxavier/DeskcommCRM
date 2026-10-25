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
import { CommandHero } from "@/components/politico/command-hero";
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
    .select("id, contact_id, support_level, community_role, leader_potential")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();
  const l = lead as {
    id: string;
    contact_id: string;
    support_level: string;
    community_role: string | null;
    leader_potential: boolean | null;
  };

  const { data: contact } = await db
    .from("contacts")
    .select("id, name, phone_number, email, custom_fields")
    .eq("id", l.contact_id)
    .maybeSingle();

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
    community_role: l.community_role ?? "",
    leader_potential: !!l.leader_potential,
  };

  return (
    <div className="mx-auto max-w-[720px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Base · Pessoas"
        titulo="Editar pessoa"
        subtitulo="Ajuste os dados de contato e a classificação política. As mudanças valem na hora."
        acoes={[{ href: `/app/politico/leads/${inicial.leadId}`, label: "← Ficha" }]}
      />
      <EditarLeadForm inicial={inicial} />
    </div>
  );
}

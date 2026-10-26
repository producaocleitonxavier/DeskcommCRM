import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { CaptacaoQrClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Captação por QR" };

export default async function CaptacaoQrPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  // Materiais ativos para entregar no cadastro.
  const { data: mats } = await db
    .from("pol_materiais")
    .select("id, titulo")
    .eq("organization_id", org.orgId)
    .eq("ativo", true)
    .order("titulo", { ascending: true });
  const materiais = (mats ?? []) as { id: string; titulo: string }[];

  // Números de WhatsApp (sessões WAHA) para onde o QR aponta.
  const { data: chs } = await db
    .from("channel_sessions")
    .select("id, phone_number, display_name, waha_session_name, provider, status")
    .eq("organization_id", org.orgId)
    .eq("provider", "waha")
    .order("created_at", { ascending: true });
  const canais = ((chs ?? []) as {
    id: string;
    phone_number: string | null;
    display_name: string | null;
    waha_session_name: string | null;
    status: string | null;
  }[]).map((c) => ({
    id: c.id,
    numero: c.phone_number,
    rotulo: c.display_name ?? c.phone_number ?? "Número de WhatsApp",
    conectado: c.status === "WORKING",
  }));

  return <CaptacaoQrClient materiais={materiais} canais={canais} />;
}

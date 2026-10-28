/**
 * /app/politico/voz — "Voz do Mandato" (Fase 2, scaffold).
 *
 * Setup do clone de voz do próprio político (ElevenLabs): grava/sobe a amostra,
 * assina o consentimento, ouve a prévia e liga/desliga. DORMENTE por padrão.
 * No menu em Atendimento (minRole admin). Acesso: admin.
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { lerVozConfig } from "@/lib/voz/config";
import { vozProviderConfigurado } from "@/lib/voz/elevenlabs";
import { lerVozSpeed } from "@/lib/voz/velocidade";
import VozClient from "./_voz-client";

export const dynamic = "force-dynamic";

export default async function VozPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.admin) redirect("/app/politico");

  const db = await createClient();
  const cfg = await lerVozConfig(db, org.orgId);
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  const velocidade = lerVozSpeed(orgRow?.settings);

  return (
    <VozClient
      inicial={{
        temVoz: !!cfg.voiceId,
        ativo: cfg.ativo,
        consentimentoPor: cfg.consentimentoPor,
        consentimentoEm: cfg.consentimentoEm,
        providerConfigurado: vozProviderConfigurado(),
        velocidade,
      }}
    />
  );
}

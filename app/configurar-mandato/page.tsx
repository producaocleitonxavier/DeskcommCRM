/**
 * /configurar-mandato — a TELA CHEIA obrigatória da 1ª entrada do ADMIN.
 *
 * Fica FORA do /app (como o /onboarding) de propósito: o portão do /app
 * (app/app/layout.tsx) manda o admin NÃO configurado pra cá, e como esta rota
 * não é filha daquele layout, não há menu nem loop. Assessores (não-admin)
 * nunca são mandados pra cá — caem direto no sistema já configurado.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setupDoMandatoCompleto } from "@/lib/politico/setup-do-mandato";
import { marcaDaSaida } from "@/lib/branding/saida";
import BoasVindasEConfig from "./_boas-vindas";

export const dynamic = "force-dynamic";

export default async function ConfigurarMandatoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/login");
  // Só o admin (chefia) configura. Assessor cai direto no sistema.
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.admin) redirect("/app/politico");

  const admin = createAdminClient();
  const { data: orgRow } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  // Já configurado → não força de novo (acesso direto à rota não re-tranca).
  if (setupDoMandatoCompleto(orgRow?.settings)) redirect("/app/politico");

  const db = await createClient();
  const { data } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, cidade, subtitulo")
    .eq("organization_id", org.orgId)
    .maybeSingle();
  const marca = await marcaDaSaida(null);

  return (
    <BoasVindasEConfig
      inicial={{
        nome: data?.nome_parlamentar ?? "",
        cargo: data?.cargo ?? "",
        cidade: data?.cidade ?? "",
        subtitulo: data?.subtitulo ?? "",
      }}
      marcaNome={marca.nome}
    />
  );
}

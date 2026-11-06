/**
 * /app/campaigns/cobaia — Laboratório de disparo (operar a COBAIA)
 *
 * A tela de OPERAR o laboratório do teste em escala, à prova de criança: ligar o
 * modo cobaia (só telefone-semente recebe), o BOTÃO DE PÂNICO (para todo disparo
 * na hora) e cadastrar/ver as sementes. A trava em si está no motor
 * (`lib/campanhas/rodada.ts` + migration 9090); aqui é o painel de controle.
 *
 * ⚠️ Esta org vira laboratório quando o modo cobaia está LIGADO. É para a
 * ORG-COBAIA (base fictícia nossa), NUNCA para a org de produção com eleitores
 * reais. Enquanto o modo está desligado, nada aqui restringe o envio.
 *
 * Server component: auth + leitura (RLS por org). Gate admin — é controle de
 * segurança de envio. As escritas são server actions em cobaia-actions.ts.
 */

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import CobaiaClient, { type SementeView } from "./_client";

export const dynamic = "force-dynamic";

interface ControleRow {
  modo_cobaia: boolean | null;
  envio_pausado: boolean | null;
}

async function carregar(
  organizationId: string,
): Promise<{ modoCobaia: boolean; envioPausado: boolean; sementes: SementeView[] }> {
  const db = await createClient();
  const [{ data: ctrl }, { data: sementes }] = await Promise.all([
    db
      .from("pol_cobaia_controle")
      .select("modo_cobaia, envio_pausado")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    db
      .from("pol_cobaia_semente")
      .select("id, telefone, rotulo")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
  ]);
  const c = (ctrl ?? null) as ControleRow | null;
  return {
    modoCobaia: !!c?.modo_cobaia,
    envioPausado: !!c?.envio_pausado,
    sementes: ((sementes ?? []) as SementeView[]).map((s) => ({
      id: s.id,
      telefone: s.telefone,
      rotulo: s.rotulo ?? null,
    })),
  };
}

export default async function CobaiaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "admin");

  const estado = await carregar(org.orgId);

  return <CobaiaClient {...estado} />;
}

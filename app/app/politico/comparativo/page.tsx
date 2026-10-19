/**
 * /app/politico/comparativo — Arena Comparativa (Módulo Inteligência / TSE).
 *
 * Compara 2–3 candidatos lado a lado dentro de um município, por bairro, local
 * de votação, zona e seção (votos, % e posição de cada um em cada localidade).
 * Server component: auth + eleições + municípios. Fluxo no client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import { listarEleicoes } from "@/app/actions/politico/intelEleitoral";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";
import ComparativoClient from "./_comparativo-client";

export const dynamic = "force-dynamic";

export default async function ComparativoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const [eleicoes, municipios] = await Promise.all([listarEleicoes(), listarMunicipiosRaioX()]);

  return (
    <div className="mx-auto max-w-[1140px] space-y-6 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · TSE"
        titulo="Arena Comparativa"
        subtitulo="Compare candidatos lado a lado — quem é forte onde, por bairro, local de votação, zona e seção."
      />
      {eleicoes.length === 0 ? (
        <div className="wr-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Dados eleitorais ainda não carregados nesta instalação.
          </p>
        </div>
      ) : (
        <ComparativoClient eleicoes={eleicoes} municipios={municipios} />
      )}
    </div>
  );
}

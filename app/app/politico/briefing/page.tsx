/**
 * /app/politico/briefing — Dossiê Estratégico (Módulo Inteligência · Pilar 4).
 *
 * Capstone cross-data: candidato + município → a IA cruza voto (TSE), redutos
 * por bairro, projeção (universo × base do CRM) e escreve um briefing de
 * campanha. Server component: auth + eleições + municípios. Fluxo no client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import { listarEleicoes } from "@/app/actions/politico/intelEleitoral";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";
import BriefingClient from "./_briefing-client";
import { obterMandatoPadrao } from "@/lib/politico/mandato-padrao";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const [eleicoes, municipios] = await Promise.all([listarEleicoes(), listarMunicipiosRaioX()]);
  const padrao = await obterMandatoPadrao(municipios);

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] space-y-6 px-4 py-7">
      <CommandHero
        eyebrow="Estratégia · Dossiê"
        titulo="Dossiê Estratégico"
        subtitulo="Um candidato e uma cidade: a IA cruza os votos, os bairros mais fortes e a sua base, e escreve o plano."
      />
      {eleicoes.length === 0 ? (
        <div className="gip-glass p-12 text-center">
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Dados eleitorais ainda não carregados nesta instalação.
          </p>
        </div>
      ) : (
        <BriefingClient eleicoes={eleicoes} municipios={municipios} padrao={padrao} />
      )}
    </div>
  );
}

/**
 * /app/politico/radar-zonal — Radar Zonal (Módulo Inteligência / TSE + CRM).
 *
 * A zona eleitoral como unidade de OPERAÇÃO de campo: para um candidato num
 * município, mostra por zona os votos, os BAIRROS que ela abrange, os top
 * locais de votação (escolas) e — o diferencial — quantos LEADS da nossa base
 * caem ali (cruzamento bairro→zona). Server: auth + eleições + municípios.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import { listarEleicoes } from "@/app/actions/politico/intelEleitoral";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";
import RadarClient from "./_radar-client";

export const dynamic = "force-dynamic";

export default async function RadarZonalPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const [eleicoes, municipios] = await Promise.all([listarEleicoes(), listarMunicipiosRaioX()]);

  return (
    <div className="mx-auto max-w-[1140px] space-y-6 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · TSE + CRM"
        titulo="Radar Zonal"
        subtitulo="A zona como unidade de operação: votos, bairros, locais de votação e a sua base — cruzados."
      />
      {eleicoes.length === 0 ? (
        <div className="wr-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Dados eleitorais ainda não carregados nesta instalação.
          </p>
        </div>
      ) : (
        <RadarClient eleicoes={eleicoes} municipios={municipios} />
      )}
    </div>
  );
}

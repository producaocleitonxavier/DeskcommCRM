/**
 * /app/politico/raio-x-votos — Raio-X de Votos (Módulo Inteligência / TSE).
 *
 * Explorador por candidato no nível de seção (município → zona → bairro →
 * local → seção). Server component: auth + lista de eleições. O fluxo vive no
 * client (./_raiox-client).
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import { listarEleicoes } from "@/app/actions/politico/intelEleitoral";
import { listarMunicipiosRaioX } from "@/app/actions/politico/raioX";
import RaioXClient from "./_raiox-client";

export const dynamic = "force-dynamic";

export default async function RaioXVotosPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const [eleicoes, municipios] = await Promise.all([listarEleicoes(), listarMunicipiosRaioX()]);

  return (
    <div className="mx-auto max-w-[1140px] space-y-6 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · TSE"
        titulo="Raio-X de Votos"
        subtitulo="Busque um candidato e veja os votos por município, zona, bairro, local de votação e seção."
      />
      {eleicoes.length === 0 ? (
        <div className="wr-card p-12 text-center">
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Dados eleitorais ainda não carregados nesta instalação.
          </p>
        </div>
      ) : (
        <RaioXClient eleicoes={eleicoes} municipios={municipios} />
      )}
    </div>
  );
}

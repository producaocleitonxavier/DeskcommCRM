/**
 * /app/politico/obras — Obras & Fiscalização (Gabinete).
 *
 * Módulo adaptativo por mandato: cada registro é uma obra/serviço/contrato
 * público num território, com NATUREZA "execução" (Executivo gerencia) ou
 * "fiscalização" (Legislativo fiscaliza). Lista + KPIs; fluxo no client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { CommandHero } from "@/components/politico/command-hero";
import { listarEleicoes, type EleicaoOpcao } from "@/app/actions/politico/intelEleitoral";
import { obterMandatoTse } from "@/app/actions/politico/obras-actions";
import ObrasClient, { type ObraRow } from "./_obras-client";

export const dynamic = "force-dynamic";

export default async function ObrasPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [{ data: obras }, { data: config }, mandato, eleicoes] = await Promise.all([
    db.from("pol_obras")
      .select("id, titulo, natureza, tipo, area_tematica, status, percentual, valor_cents, municipio, bairro, prioridade, data_prevista, orgao_responsavel, empresa_nome, created_at")
      .eq("organization_id", org.orgId)
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("pol_gabinete_config").select("cargo").eq("organization_id", org.orgId).maybeSingle(),
    obterMandatoTse(),
    listarEleicoes(),
  ]);

  const linhas = (obras ?? []) as ObraRow[];
  const cargo = String((config as { cargo?: string } | null)?.cargo ?? "").toLowerCase();
  const executivo = /prefeit|governad|vice/.test(cargo);

  return (
    <div className="mx-auto max-w-[1140px] space-y-6 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Gabinete · Território"
        titulo="Obras & Fiscalização"
        subtitulo={
          executivo
            ? "As obras, serviços e contratos que você executa — do contrato à entrega, com vistorias e fotos."
            : "As obras, serviços e contratos que você fiscaliza — vistorias em campo, checklist, fotos e cobrança."
        }
      />
      <ObrasClient obras={linhas} executivo={executivo} eleicoes={eleicoes as EleicaoOpcao[]} mandatoInicial={mandato} />
    </div>
  );
}

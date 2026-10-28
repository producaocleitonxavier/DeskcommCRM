/**
 * Config da "Voz do Mandato" (Fase 2), por organização. Singleton em
 * `pol_voz_config` (migration 9065). DORMENTE por padrão: nada gera voz enquanto
 * `ativo=false`, sem `voice_id` ou sem consentimento. O guardrail TSE
 * (23.755/2026) é estrutural — só a voz do PRÓPRIO político, com consentimento
 * arquivado — e vive aqui, não só na UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface VozConfig {
  organizationId: string;
  ativo: boolean;
  provider: string;
  voiceId: string | null;
  amostraUrl: string | null;
  consentimentoAssinado: boolean;
  consentimentoPor: string | null;
  consentimentoEm: string | null;
  consentimentoDocUrl: string | null;
}

export const VOZ_DORMENTE: Omit<VozConfig, "organizationId"> = {
  ativo: false,
  provider: "elevenlabs",
  voiceId: null,
  amostraUrl: null,
  consentimentoAssinado: false,
  consentimentoPor: null,
  consentimentoEm: null,
  consentimentoDocUrl: null,
};

export async function lerVozConfig(db: SupabaseClient, orgId: string): Promise<VozConfig> {
  const { data } = await db
    .from("pol_voz_config")
    .select(
      "ativo, provider, voice_id, amostra_url, consentimento_assinado, consentimento_por, consentimento_em, consentimento_doc_url",
    )
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!data) return { organizationId: orgId, ...VOZ_DORMENTE };

  const d = data as Record<string, unknown>;
  return {
    organizationId: orgId,
    ativo: d.ativo === true,
    provider: typeof d.provider === "string" ? d.provider : "elevenlabs",
    voiceId: typeof d.voice_id === "string" ? d.voice_id : null,
    amostraUrl: typeof d.amostra_url === "string" ? d.amostra_url : null,
    consentimentoAssinado: d.consentimento_assinado === true,
    consentimentoPor: typeof d.consentimento_por === "string" ? d.consentimento_por : null,
    consentimentoEm: typeof d.consentimento_em === "string" ? d.consentimento_em : null,
    consentimentoDocUrl: typeof d.consentimento_doc_url === "string" ? d.consentimento_doc_url : null,
  };
}

/**
 * A máquina pode GERAR voz? Exige: ligada + clone pronto + consentimento assinado.
 * O consentimento é parte da trava (não é só UI) — guardrail TSE estrutural.
 */
export function vozArmada(c: VozConfig): boolean {
  return c.ativo && !!c.voiceId && c.consentimentoAssinado;
}

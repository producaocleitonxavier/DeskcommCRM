/**
 * Config de PERSONALIZAÇÃO da captação do Instagram, por organização.
 *
 * Cada candidato configura a própria região-alvo (estado/cidade) e os textos do
 * flow. O Kanban de captação e a qualificação (peça 2) leem daqui e se adaptam —
 * nada chumbado na corrida do Cleiton. Tabela: pol_ig_captacao_config (9041).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Abrangencia = "cidade" | "cidade_rm" | "estado";

export interface CaptacaoConfig {
  organizationId: string;
  ativo: boolean;
  estadoAlvo: string | null;
  cidadeAlvo: string | null;
  abrangencia: Abrangencia;
  cidadesExtra: string[];
  textoRespostaComentario: string;
  textoDmPesquisa: string;
  textoDmWhatsapp: string;
  textoDmEntrega: string;
  pedirWhatsappSoAlvo: boolean;
}

export const CAPTACAO_DEFAULTS: Omit<CaptacaoConfig, "organizationId"> = {
  ativo: true,
  estadoAlvo: null,
  cidadeAlvo: null,
  abrangencia: "cidade",
  cidadesExtra: [],
  textoRespostaComentario: "Opa, te chamei no direct! 📩",
  textoDmPesquisa: "Valeu por interagir! 🙌 De qual cidade você fala?",
  textoDmWhatsapp: "Quer receber as novidades da campanha em primeira mão? Me passa seu WhatsApp (com DDD) 👇",
  textoDmEntrega: "Prontinho! 🎁 Aqui estão os e-books gratuitos: [COLE O LINK AQUI]. Qualquer coisa, é só chamar!",
  pedirWhatsappSoAlvo: true,
};

export async function lerCaptacaoConfig(
  db: SupabaseClient,
  orgId: string,
): Promise<CaptacaoConfig> {
  const { data } = await db
    .from("pol_ig_captacao_config")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!data) return { organizationId: orgId, ...CAPTACAO_DEFAULTS };

  const d = data as Record<string, unknown>;
  const str = (k: string, fb: string | null): string | null =>
    typeof d[k] === "string" && (d[k] as string).length ? (d[k] as string) : fb;

  return {
    organizationId: orgId,
    ativo: d.ativo !== false,
    estadoAlvo: str("estado_alvo", null),
    cidadeAlvo: str("cidade_alvo", null),
    abrangencia: (["cidade", "cidade_rm", "estado"].includes(d.abrangencia as string)
      ? (d.abrangencia as Abrangencia)
      : "cidade"),
    cidadesExtra: Array.isArray(d.cidades_extra) ? (d.cidades_extra as string[]) : [],
    textoRespostaComentario: str("texto_resposta_comentario", CAPTACAO_DEFAULTS.textoRespostaComentario)!,
    textoDmPesquisa: str("texto_dm_pesquisa", CAPTACAO_DEFAULTS.textoDmPesquisa)!,
    textoDmWhatsapp: str("texto_dm_whatsapp", CAPTACAO_DEFAULTS.textoDmWhatsapp)!,
    textoDmEntrega: str("texto_dm_entrega", CAPTACAO_DEFAULTS.textoDmEntrega)!,
    pedirWhatsappSoAlvo: d.pedir_whatsapp_so_alvo !== false,
  };
}

/** Rótulo curto do alvo: "Belo Horizonte", "Belo Horizonte + região", "MG". */
export function rotuloAlvo(c: CaptacaoConfig): string {
  if (c.abrangencia === "estado") return c.estadoAlvo ?? "estado-alvo";
  const base = c.cidadeAlvo ?? "cidade-alvo";
  return c.abrangencia === "cidade_rm" ? `${base} + região` : base;
}

/** Rótulo do vínculo (ex. "vínculo com Belo Horizonte"), usado nas tags do card. */
export function rotuloVinculo(c: CaptacaoConfig): string {
  return `vínculo com ${c.cidadeAlvo ?? c.estadoAlvo ?? "o alvo"}`;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** A cidade/UF informada está na região-alvo do candidato? */
export function estaNoAlvo(
  c: CaptacaoConfig,
  cidade: string | null,
  uf: string | null,
): boolean {
  if (c.abrangencia === "estado") {
    return !!uf && !!c.estadoAlvo && norm(uf) === norm(c.estadoAlvo);
  }
  if (!cidade) return false;
  const alvos = [c.cidadeAlvo, ...(c.abrangencia === "cidade_rm" ? c.cidadesExtra : [])].filter(
    Boolean,
  ) as string[];
  return alvos.some((a) => norm(a) === norm(cidade));
}

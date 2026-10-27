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
  /** Resposta pública ao comentário de quem JÁ está no funil (diferente da 1ª vez). */
  textoRespostaComentarioRetorno: string;
  textoDmPesquisa: string;
  textoDmWhatsapp: string;
  textoDmEntrega: string;
  textoDmRetorno: string;
  /** Link do material (ebook/PDF/vídeo). Entra sozinho onde houver {{link}} nas mensagens. */
  linkMaterial: string | null;
  pedirWhatsappSoAlvo: boolean;
}

export const CAPTACAO_DEFAULTS: Omit<CaptacaoConfig, "organizationId"> = {
  ativo: true,
  estadoAlvo: null,
  cidadeAlvo: null,
  abrangencia: "cidade",
  cidadesExtra: [],
  textoRespostaComentario: "Que bom te ver por aqui! 🙏 Te chamei no direct, dá uma conferida 📩",
  textoRespostaComentarioRetorno: "Opa, de novo por aqui! 🙏 Já te respondi lá no direct, dá uma olhada 📩",
  // A mensagem que CONVERTE: oferece valor (material gratuito todo mês) e pede os
  // 4 dados de uma vez — estado, cidade, bairro e WhatsApp. A IA extrai tudo que
  // vier; o que faltar é reperguntado. (Lição do DG Digital: sem troca clara,
  // ninguém passa WhatsApp nem de onde é.)
  textoDmPesquisa:
    "Que bom ter você nessa batalha! 🙏 Pra eu te mandar nossos materiais gratuitos todo mês — ebooks e vídeos exclusivos — direto no seu WhatsApp, me conta: de qual *estado, cidade e bairro* você fala? E qual seu *WhatsApp* (com DDD)? 👇",
  textoDmWhatsapp:
    "Show! 🙌 Só falta o seu *WhatsApp* (com DDD) pra eu te enviar os materiais. Me manda assim: (31) 99999-9999",
  textoDmEntrega:
    "Prontinho! 🎁 Seu material está aqui: {{link}} — todo mês eu te mando novidades gratuitas por aqui. Conta comigo! 💚",
  textoDmRetorno:
    "Que bom te ver de novo! 🙏 Muito obrigado pelo apoio de sempre. O material mais recente está aqui: {{link}}",
  linkMaterial: null,
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
    textoRespostaComentarioRetorno: str("texto_resposta_comentario_retorno", CAPTACAO_DEFAULTS.textoRespostaComentarioRetorno)!,
    textoDmPesquisa: str("texto_dm_pesquisa", CAPTACAO_DEFAULTS.textoDmPesquisa)!,
    textoDmWhatsapp: str("texto_dm_whatsapp", CAPTACAO_DEFAULTS.textoDmWhatsapp)!,
    textoDmEntrega: str("texto_dm_entrega", CAPTACAO_DEFAULTS.textoDmEntrega)!,
    textoDmRetorno: str("texto_dm_retorno", CAPTACAO_DEFAULTS.textoDmRetorno)!,
    linkMaterial: str("link_material", null),
    pedirWhatsappSoAlvo: d.pedir_whatsapp_so_alvo !== false,
  };
}

/**
 * Substitui {{link}} (e o legado [COLE O LINK]) pelo link do material configurado.
 * Se não houver link, o marcador some. Textos sem marcador passam intactos — por
 * isso é seguro aplicar em qualquer mensagem.
 */
export function aplicarLinkMaterial(texto: string, c: CaptacaoConfig): string {
  const link = (c.linkMaterial ?? "").trim();
  return texto
    .replace(/\{\{\s*link\s*\}\}/gi, link)
    .replace(/\[COLE O LINK\]/gi, link);
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

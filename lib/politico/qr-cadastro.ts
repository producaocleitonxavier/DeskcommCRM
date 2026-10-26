/**
 * CADASTRO POR QR — o inbound receptivo da "arte manha".
 *
 * A pessoa escaneia um QR (praça, escola, bio do IG, evento) → o WhatsApp abre
 * com a mensagem PRONTA "Me cadastrei e quero os materiais do Cleiton [qr:CODE]"
 * → ela só aperta enviar. Esse inbound chega e ESTE módulo:
 *   1. casa o `[qr:CODE]` com uma origem (`pol_qr_origens`);
 *   2. cria o lead político (idempotente, como a captação do Instagram);
 *   3. marca a origem no contato (first-touch, não clobbera);
 *   4. RECLAMA o cadastro (unique origem×contato) e entrega o ebook da origem
 *      como DOCUMENTO com nome (anexo, nunca link);
 *   5. deixa a graduação por engajamento (outro handler do mesmo evento) subir o
 *      funil, já que "me cadastrei" É uma mensagem de entrada.
 *
 * Por que é a jogada mais segura: a PESSOA iniciou a conversa → é atendimento
 * RECEPTIVO (ban ~zero) e abre a janela de 24h. O marcador é `[qr:...]` e não
 * `[ref:...]` de propósito: `[ref:XXXXXX]` já é o token de rastreio de ANÚNCIO
 * (`lib/plataformas-de-anuncio/captura-de-clique.ts`, 6 chars) — reusá-lo
 * marcaria o cadastro como clique de anúncio.
 *
 * FAIL-SOFT: nunca lança — o chamador é um handler de evento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { enviarMaterialComoDocumento } from "@/lib/politico/enviar-material";

/** `[qr:CODE]` — colchetes e prefixo próprio para não casar por acidente. */
export const PADRAO_QR = /\[qr:([A-Za-z0-9_-]{2,24})\]/i;

/** Extrai o CÓDIGO da origem do texto (sempre MAIÚSCULO), ou null. */
export function extrairCodigoQr(texto: string | null): string | null {
  if (!texto) return null;
  const m = PADRAO_QR.exec(texto);
  return m ? m[1]!.toUpperCase() : null;
}

export interface ResultadoQrCadastro {
  status: "ok" | "skipped" | "error";
  detail: string;
}

export async function processarCadastroQr(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; texto: string | null },
): Promise<ResultadoQrCadastro> {
  try {
    const codigo = extrairCodigoQr(entrada.texto);
    if (!codigo) return { status: "skipped", detail: "sem_codigo_qr" };

    // 1) O código casa com uma origem ATIVA? (codigo é guardado em maiúsculo)
    const { data: org } = await admin
      .from("pol_qr_origens")
      .select("id, nome, material_id, channel_session_id, ativo")
      .eq("organization_id", entrada.organizationId)
      .eq("codigo", codigo)
      .eq("ativo", true)
      .maybeSingle();
    const origem = org as {
      id: string;
      nome: string;
      material_id: string | null;
      channel_session_id: string | null;
      ativo: boolean;
    } | null;
    if (!origem) return { status: "skipped", detail: `origem_nao_encontrada:${codigo}` };

    // 2) Cria o lead político (idempotente — como a captação do IG). Quem escaneou
    //    e mandou mensagem demonstrou interesse: nasce `simpatizante`.
    const { data: leadExiste } = await admin
      .from("pol_leads")
      .select("id")
      .eq("organization_id", entrada.organizationId)
      .eq("contact_id", entrada.contactId)
      .maybeSingle();
    if (!leadExiste) {
      const { error: errLead } = await admin.from("pol_leads").insert({
        organization_id: entrada.organizationId,
        contact_id: entrada.contactId,
        support_level: "simpatizante",
      });
      if (errLead && errLead.code !== "23505") {
        logger.warn("[qr-cadastro] falha ao criar pol_lead", { error: errLead.message });
      }
    }

    // 3) Marca a origem no contato — FIRST-TOUCH: só se ainda não tem origem, para
    //    não sobrescrever de onde a pessoa realmente veio.
    await admin
      .from("contacts")
      .update({ source: `QR · ${origem.nome}` })
      .eq("organization_id", entrada.organizationId)
      .eq("id", entrada.contactId)
      .or("source.is.null,source.eq.");

    // 4) RECLAMA o cadastro (unique origem×contato): quem não reclamar não entrega
    //    o ebook de novo. Se já existe e o material já saiu, encerra.
    const { data: claim, error: errClaim } = await admin
      .from("pol_qr_cadastros")
      .insert({
        organization_id: entrada.organizationId,
        origem_id: origem.id,
        contact_id: entrada.contactId,
      })
      .select("id")
      .maybeSingle();
    if (errClaim && errClaim.code === "23505") {
      // Já cadastrado nesta origem. Só re-entrega se o material ficou pendente.
      const { data: existente } = await admin
        .from("pol_qr_cadastros")
        .select("id, material_entregue_at")
        .eq("origem_id", origem.id)
        .eq("contact_id", entrada.contactId)
        .maybeSingle();
      if (!existente || (existente as { material_entregue_at: string | null }).material_entregue_at) {
        return { status: "ok", detail: "ja_cadastrado" };
      }
    } else if (errClaim) {
      return { status: "error", detail: errClaim.message };
    }

    // 5) Entrega o ebook da origem como DOCUMENTO com nome (se houver material e canal).
    if (!origem.material_id || !origem.channel_session_id) {
      return { status: "ok", detail: "cadastrado_sem_material" };
    }
    const { data: mat } = await admin
      .from("pol_materiais")
      .select("titulo, url, ativo")
      .eq("organization_id", entrada.organizationId)
      .eq("id", origem.material_id)
      .maybeSingle();
    const material = mat as { titulo: string | null; url: string | null; ativo: boolean | null } | null;
    if (!material || material.ativo === false || !material.url) {
      return { status: "ok", detail: "cadastrado_material_invalido" };
    }

    const legenda = material.titulo
      ? `Que bom ter você com a gente! 🙏 Aqui está o material que prometi: *${material.titulo}*. Qualquer dúvida, é só me chamar por aqui.`
      : "Que bom ter você com a gente! 🙏 Aqui está o material. Qualquer dúvida, é só me chamar por aqui.";
    const r = await enviarMaterialComoDocumento(admin, {
      organizationId: entrada.organizationId,
      contactId: entrada.contactId,
      canalId: origem.channel_session_id,
      material: { titulo: material.titulo, url: material.url },
      legenda,
      rotulo: `qr-cadastro:${origem.id}`,
    });
    if (!r.enviou) {
      // Deixa material_entregue_at null → um próximo "me cadastrei" tenta de novo.
      logger.warn("[qr-cadastro] envio do material falhou", {
        organization_id: entrada.organizationId,
        contact_id: entrada.contactId,
        detail: r.erro,
      });
      return { status: "error", detail: `envio_falhou:${r.erro ?? ""}` };
    }

    await admin
      .from("pol_qr_cadastros")
      .update({ material_entregue_at: new Date().toISOString() })
      .eq("origem_id", origem.id)
      .eq("contact_id", entrada.contactId);

    return { status: "ok", detail: `entregue:${origem.nome}` };
  } catch (err) {
    logger.warn("[qr-cadastro] falhou (a conversa segue normal)", {
      organization_id: entrada.organizationId,
      contact_id: entrada.contactId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return { status: "error", detail: "excecao" };
  }
}

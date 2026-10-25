/**
 * DESCADASTRO DURÁVEL — quem pediu para sair não volta no próximo import.
 *
 * ═══ O problema que este arquivo resolve ═══
 *
 * O opt-out já existia e já funcionava: `contacts.is_blocked` cala o produto
 * inteiro para a pessoa (agente, campanha, follow-up, funil — regra W-02/W-03),
 * gravado na ingestão por `lib/channels/pos-entrada.ts`. Mas o bloqueio mora na
 * LINHA do contato — e a base política é RE-IMPORTADA (abaixo-assinado, eventos,
 * sindicatos). Zerar a base e subir a planilha de novo apagava o `is_blocked`
 * junto com o contato: quem pediu para sair voltava como cadastro novo.
 *
 * `campaign_suppressions` existe justamente para sobreviver a isso — guarda o
 * HASH do telefone (não o número), com `contact_id` que vira NULL quando o
 * contato é apagado, mas o HASH fica. Faltava só LIGAR o opt-out a ela: ao
 * bloquear, gravar também a supressão; no import, pular quem está suprimido.
 *
 * Este módulo é esse elo. Uma função que o caminho automático (ingestão) e o
 * manual (botão da ficha) chamam igual, e o import consulta pelo hash.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { enderecoValido, finalDoEndereco, hashDoEndereco } from "@/lib/campanhas/exclusoes";
import { logger } from "@/lib/logger";

/** `source` aceito pela coluna (CHECK da migration 0376): quem gravou a supressão. */
export type FonteDaSupressao = "manual" | "import" | "sistema";

/**
 * Grava o telefone do contato na lista de supressão (por hash), para que um
 * RE-IMPORT não ressuscite quem pediu para sair.
 *
 * Idempotente: a segunda chamada bate no índice único (hash por organização) e
 * é tratada como sucesso silencioso — já estar na lista é o resultado desejado.
 *
 * FAIL-SOFT de propósito: devolve `false` em qualquer falha e NUNCA lança. O
 * chamador principal é a ingestão (`pos-entrada.ts`), que não pode virar 500 —
 * uma exceção aqui faria o provider reenviar a mensagem. O bloqueio em si
 * (`is_blocked`) é gravado à parte e é o que de fato cala o produto; a supressão
 * é a camada de durabilidade.
 */
export async function suprimirEnderecoDoContato(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  opts: { reason?: string | null; source?: FonteDaSupressao; createdBy?: string | null } = {},
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("contacts")
      .select("phone_number")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle();

    const telefone = (data as { phone_number?: string | null } | null)?.phone_number ?? "";
    // Sem telefone de verdade não há endereço para suprimir. O bloqueio na linha
    // (is_blocked) continua valendo; só a durabilidade por hash não se aplica.
    if (!enderecoValido(telefone)) return false;

    const { error } = await admin.from("campaign_suppressions").insert({
      organization_id: organizationId,
      contact_id: contactId,
      recipient_address_hash: hashDoEndereco(telefone),
      address_tail: finalDoEndereco(telefone),
      reason: opts.reason ?? null,
      source: opts.source ?? "sistema",
      created_by: opts.createdBy ?? null,
    });

    // 23505 = já estava na lista. É o que a pessoa queria; não é erro.
    if (error && error.code !== "23505") {
      logger.warn("descadastro: supressão NÃO gravada (o bloqueio na linha vale)", {
        organization_id: organizationId,
        contact_id: contactId,
        detail: error.message.slice(0, 160),
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("descadastro: supressão falhou (o bloqueio na linha vale)", {
      organization_id: organizationId,
      contact_id: contactId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return false;
  }
}

/** O hash de um telefone cru, para o import comparar contra a lista de supressão. */
export function hashDeTelefone(bruto: string): string {
  return hashDoEndereco(bruto);
}

"use server";

/**
 * DESCADASTRAR / REATIVAR uma pessoa pela ficha (War Room).
 *
 * O caminho MANUAL do opt-out: a pessoa pediu para sair pessoalmente, por
 * telefone, no evento — e o assessor registra isso na ficha. Espelha o que a
 * ingestão faz sozinha quando o pedido chega por mensagem (`pos-entrada.ts`):
 * grava `contacts.is_blocked` (cala agente, campanha, follow-up e funil — regra
 * W-02/W-03) E a supressão por hash (sobrevive ao wipe/re-import da base).
 *
 * ⚠️ GATE ADMIN, não manager: fechar — e principalmente REABRIR — um canal que a
 * pessoa fechou é decisão com consequência jurídica (direito de oposição,
 * LGPD). É a mesma régua da rota `POST /contacts/[id]/unblock`, que a regra W-02
 * nomeia como "tenant admin, ação auditada".
 *
 * ⚠️ SERVICE ROLE com `organization_id` de FONTE CONFIÁVEL (resolveActiveOrg),
 * nunca de argumento — CLAUDE.md, anti-pattern 10.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { suprimirEnderecoDoContato } from "@/lib/politico/descadastro";

export type ResultadoDescadastro =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "nao_encontrado"
        | "erro_ao_gravar";
    };

const entradaSchema = z.object({
  contactId: z.uuid(),
  leadId: z.uuid().optional(),
  motivo: z.string().trim().max(200).optional(),
});

/**
 * Descadastra a pessoa: bloqueia a linha e grava a supressão durável.
 * Idempotente — regravar `true` sobre `true` é barato, e cada chamada deixa sua
 * linha de auditoria.
 */
export async function descadastrarPessoa(entrada: {
  contactId: string;
  leadId?: string;
  motivo?: string;
}): Promise<ResultadoDescadastro> {
  const parsed = entradaSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "validation_failed" };
  const { contactId, leadId, motivo } = parsed.data;

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("contacts")
    .update({
      is_blocked: true,
      blocked_reason: motivo && motivo.length > 0 ? `descadastro_manual: ${motivo}` : "descadastro_manual",
      blocked_at: agora,
    })
    .eq("organization_id", org.orgId)
    .eq("id", contactId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "erro_ao_gravar" };
  if (!data) return { ok: false, error: "nao_encontrado" };

  // Durabilidade: sobrevive ao wipe/re-import. Best-effort — o bloqueio na linha
  // já vale; se o telefone não for válido, só esta camada não se aplica.
  await suprimirEnderecoDoContato(admin, org.orgId, contactId, {
    source: "manual",
    reason: motivo && motivo.length > 0 ? motivo.slice(0, 160) : "descadastro_manual",
    createdBy: user.id,
  });

  await audit({
    action: "contact.blocked",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "contact",
    resourceId: contactId,
    metadata: { reason: "descadastro_manual", contact_id: contactId, origem: "ficha_politica" },
  });

  revalidatePath("/app/politico/leads");
  if (leadId) revalidatePath(`/app/politico/leads/${leadId}`);
  return { ok: true };
}

/**
 * Reativa a pessoa: desfaz o bloqueio E tira da supressão (senão ela continuaria
 * fora das campanhas depois de reativada). Devolve o DIREITO de enviar — não
 * dispara envio nenhum, como a rota de unblock.
 */
export async function reativarPessoa(entrada: {
  contactId: string;
  leadId?: string;
}): Promise<ResultadoDescadastro> {
  const parsed = entradaSchema.pick({ contactId: true, leadId: true }).safeParse(entrada);
  if (!parsed.success) return { ok: false, error: "validation_failed" };
  const { contactId, leadId } = parsed.data;

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, error: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contacts")
    .update({ is_blocked: false, blocked_reason: null, blocked_at: null })
    .eq("organization_id", org.orgId)
    .eq("id", contactId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "erro_ao_gravar" };
  if (!data) return { ok: false, error: "nao_encontrado" };

  // Tira da lista de supressão para a pessoa voltar a poder receber campanha.
  await admin
    .from("campaign_suppressions")
    .delete()
    .eq("organization_id", org.orgId)
    .eq("contact_id", contactId);

  await audit({
    action: "contact.unblocked",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "contact",
    resourceId: contactId,
    metadata: { contact_id: contactId, origem: "ficha_politica" },
  });

  revalidatePath("/app/politico/leads");
  if (leadId) revalidatePath(`/app/politico/leads/${leadId}`);
  return { ok: true };
}

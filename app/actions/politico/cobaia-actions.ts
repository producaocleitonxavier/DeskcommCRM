"use server";

/**
 * Operar a COBAIA pela tela, sem tocar em banco: ligar/desligar o modo
 * laboratório, o BOTÃO DE PÂNICO (pausar todo disparo da org na hora) e a
 * allowlist de telefones-semente. A trava em si mora em `lib/campanhas/rodada.ts`
 * (travaDeCobaia) + migration 9090; aqui só a gravação dos controles.
 *
 * ⚠️ SERVICE ROLE com `organization_id` de FONTE CONFIÁVEL (resolveActiveOrg),
 * nunca de argumento — o mesmo cuidado de `definirAvisoDeResolucao`.
 *
 * Gate ADMIN: ligar o modo cobaia ou mexer na allowlist decide se um disparo sai
 * para um número ou não — é controle de SEGURANÇA de envio, do admin da operação.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

type ErroCobaia =
  | "validation_failed"
  | "unauthenticated"
  | "forbidden_tenant"
  | "forbidden_role"
  | "mfa_required"
  | "erro_ao_gravar";

export type ResultadoCobaia = { ok: true } | { ok: false; error: ErroCobaia };

const ROTA = "/app/campaigns/cobaia";

/** Autentica, resolve a org de fonte confiável e exige admin. Não exportada. */
async function portao(): Promise<
  | { erro: ErroCobaia }
  | { orgId: string; userId: string; admin: ReturnType<typeof createAdminClient> }
> {
  const user = await loadAuthUser();
  if (!user) return { erro: "unauthenticated" };
  if (supportWriteError(user.support)) return { erro: "forbidden_role" };
  const org = await resolveActiveOrg(user);
  if (!org) return { erro: "forbidden_tenant" };
  if (ROLE_RANK[org.role] < ROLE_RANK.admin) return { erro: "forbidden_role" };
  if (await mfaEmDivida()) return { erro: "mfa_required" };
  return { orgId: org.orgId, userId: user.id, admin: createAdminClient() };
}

/** Garante que existe a linha de controle da org (idempotente) e devolve o admin. */
async function definirControle(
  campo: "modo_cobaia" | "envio_pausado",
  valor: boolean,
): Promise<ResultadoCobaia> {
  const entrada = z.boolean().safeParse(valor);
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const p = await portao();
  if ("erro" in p) return { ok: false, error: p.erro };

  const { error } = await p.admin.from("pol_cobaia_controle").upsert(
    {
      organization_id: p.orgId,
      [campo]: entrada.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: `pol_cobaia.${campo}_updated`,
    actorUserId: p.userId,
    organizationId: p.orgId,
    resourceType: "organization",
    resourceId: p.orgId,
    metadata: { valor: entrada.data },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

/** Liga/desliga o MODO LABORATÓRIO (só telefone-semente pode receber). */
export async function definirModoCobaia(ligar: boolean): Promise<ResultadoCobaia> {
  return definirControle("modo_cobaia", ligar);
}

/** BOTÃO DE PÂNICO: pausa/retoma TODO disparo de campanha da org na hora. */
export async function definirPanico(pausar: boolean): Promise<ResultadoCobaia> {
  return definirControle("envio_pausado", pausar);
}

/** Acrescenta um telefone-semente à allowlist (os únicos que podem receber). */
export async function adicionarSemente(
  telefone: string,
  rotulo: string,
): Promise<ResultadoCobaia> {
  const entrada = z
    .object({
      telefone: z.string().trim().min(1),
      rotulo: z.string().trim().max(120).optional().default(""),
    })
    .safeParse({ telefone, rotulo });
  if (!entrada.success) return { ok: false, error: "validation_failed" };
  // Pelo menos 8 dígitos: evita cadastrar lixo como semente (um número curto
  // demais nunca casaria com um destino real de qualquer forma).
  if (entrada.data.telefone.replace(/\D/g, "").length < 8) {
    return { ok: false, error: "validation_failed" };
  }

  const p = await portao();
  if ("erro" in p) return { ok: false, error: p.erro };

  const { error } = await p.admin.from("pol_cobaia_semente").upsert(
    {
      organization_id: p.orgId,
      telefone: entrada.data.telefone,
      rotulo: entrada.data.rotulo || null,
    },
    { onConflict: "organization_id,telefone", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "pol_cobaia.semente_added",
    actorUserId: p.userId,
    organizationId: p.orgId,
    resourceType: "organization",
    resourceId: p.orgId,
    metadata: { telefone: entrada.data.telefone },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um telefone-semente da allowlist (escopado à org, nunca por id solto). */
export async function removerSemente(id: string): Promise<ResultadoCobaia> {
  const entrada = z.string().uuid().safeParse(id);
  if (!entrada.success) return { ok: false, error: "validation_failed" };

  const p = await portao();
  if ("erro" in p) return { ok: false, error: p.erro };

  const { error } = await p.admin
    .from("pol_cobaia_semente")
    .delete()
    .eq("id", entrada.data)
    .eq("organization_id", p.orgId);
  if (error) return { ok: false, error: "erro_ao_gravar" };

  await audit({
    action: "pol_cobaia.semente_removed",
    actorUserId: p.userId,
    organizationId: p.orgId,
    resourceType: "organization",
    resourceId: p.orgId,
    metadata: { semente_id: entrada.data },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

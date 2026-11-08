/**
 * PERFILAMENTO PROGRESSIVO — a 2ª mensagem do QR.
 *
 * Depois que a pessoa recebeu o material (valor primeiro), convidamos — UMA vez —
 * a completar o perfil (cidade, bairro e aniversário dia/mês) por um formulário
 * público. Enriquece a base: público por bairro + parabéns no aniversário (a régua
 * de aniversário já existe e dispara sozinha quando a data entra).
 *
 * O link `/perfil/<token>` carrega um token OPACO por contato → o formulário já
 * sabe de quem é, sem pedir WhatsApp de novo.
 *
 * FAIL-SOFT: nunca lança (chamadores são handlers de evento).
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { urlPublicaUsavel } from "@/lib/escalacao/url-publica";
import { enviarTextoNoCanal } from "@/lib/politico/enviar-material";

/**
 * O token de perfil do contato — pega o que existe ou cria um único (opaco).
 * `novo=true` SÓ quando ESTA chamada criou (venceu o compare-and-set) — desempata
 * a corrida do convite (só quem criou envia). `token=null` se falhou.
 */
export async function tokenDePerfil(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<{ token: string | null; novo: boolean }> {
  try {
    const { data: atual } = await admin
      .from("contacts")
      .select("perfil_token")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle();
    const existente = (atual as { perfil_token: string | null } | null)?.perfil_token;
    if (existente) return { token: existente, novo: false };

    const token = randomUUID().replace(/-/g, "");
    // compare-and-set: grava só se ainda está null (vence a corrida de dois inbounds).
    const { data: gravou } = await admin
      .from("contacts")
      .update({ perfil_token: token })
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .is("perfil_token", null)
      .select("perfil_token")
      .maybeSingle();
    if ((gravou as { perfil_token: string } | null)?.perfil_token === token) {
      return { token, novo: true };
    }
    // Perdeu a corrida: lê o que ficou gravado.
    const { data: depois } = await admin
      .from("contacts")
      .select("perfil_token")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle();
    return { token: (depois as { perfil_token: string | null } | null)?.perfil_token ?? null, novo: false };
  } catch {
    return { token: null, novo: false };
  }
}

/**
 * Convida a completar o perfil com o link do formulário. Best-effort, UMA vez só
 * (guard por `perfil_token`). Não envia se a URL pública não for utilizável
 * (localhost/placeholder numa instalação mal configurada).
 */
export async function convidarAPerfilar(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; canalId: string | null },
): Promise<void> {
  const { organizationId, contactId, canalId } = entrada;
  try {
    if (!canalId) return;
    // Já tem token = já convidado.
    const { data: c } = await admin
      .from("contacts")
      .select("perfil_token")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle();
    if ((c as { perfil_token: string | null } | null)?.perfil_token) return;

    const { token, novo } = await tokenDePerfil(admin, organizationId, contactId);
    // Só quem CRIOU o token agora envia — evita convite em dobro na corrida.
    if (!token || !novo) return;

    const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    const link = `${base}/perfil/${token}`;
    if (!urlPublicaUsavel(link)) {
      logger.warn("[perfil] link público não utilizável, não enviei o convite", {
        organization_id: organizationId,
      });
      return;
    }

    await enviarTextoNoCanal(admin, {
      organizationId,
      contactId,
      canalId,
      texto: `Pra gente continuar te mandando conteúdo da sua região, preenche rapidinho (leva 20 segundos) 👇\n${link}`,
      rotulo: "perfil-convite",
    });
  } catch (err) {
    logger.warn("[perfil] convite falhou (segue normal)", {
      organization_id: organizationId,
      detail: err instanceof Error ? err.message.slice(0, 120) : "?",
    });
  }
}

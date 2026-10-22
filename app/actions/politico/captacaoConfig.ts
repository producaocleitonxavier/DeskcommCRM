"use server";

/**
 * Salvar a personalização da captação do Instagram (pol_ig_captacao_config).
 * A org vem SEMPRE da sessão (nunca do form). RLS garante o isolamento.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import type { Abrangencia } from "@/lib/politico/captacao-config";

export interface SalvarCaptacaoInput {
  ativo: boolean;
  estadoAlvo: string;
  cidadeAlvo: string;
  abrangencia: Abrangencia;
  cidadesExtra: string[];
  textoRespostaComentario: string;
  textoDmPesquisa: string;
  textoDmWhatsapp: string;
  textoDmEntrega: string;
  pedirWhatsappSoAlvo: boolean;
}

export async function salvarCaptacaoConfig(
  input: SalvarCaptacaoInput,
): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão inválida." };

  // Só admin personaliza (o método é segredo da GIP) — trava no servidor.
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.admin) {
    return { ok: false, erro: "Apenas administradores podem personalizar a captação." };
  }

  const abr: Abrangencia = ["cidade", "cidade_rm", "estado"].includes(input.abrangencia)
    ? input.abrangencia
    : "cidade";

  const db = await createClient();
  const { error } = await db.from("pol_ig_captacao_config").upsert(
    {
      organization_id: org.orgId,
      ativo: input.ativo,
      estado_alvo: input.estadoAlvo.trim() || null,
      cidade_alvo: input.cidadeAlvo.trim() || null,
      abrangencia: abr,
      cidades_extra: input.cidadesExtra.map((c) => c.trim()).filter(Boolean),
      texto_resposta_comentario: input.textoRespostaComentario.trim() || null,
      texto_dm_pesquisa: input.textoDmPesquisa.trim() || null,
      texto_dm_whatsapp: input.textoDmWhatsapp.trim() || null,
      texto_dm_entrega: input.textoDmEntrega.trim() || null,
      pedir_whatsapp_so_alvo: input.pedirWhatsappSoAlvo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );

  if (error) return { ok: false, erro: error.message };

  revalidatePath("/app/instagram/captacao");
  revalidatePath("/app/instagram/captacao/config");
  return { ok: true };
}

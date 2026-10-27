"use server";

/**
 * Server action: gerar/pegar o LINK RASTREÁVEL de um vídeo (biblioteca).
 * O client do browser não vê a sessão (cookie httpOnly) → tudo passa aqui.
 * `organization_id` vem SEMPRE de resolveActiveOrg (nunca do input). Confere que
 * o material é desta org antes de mintar — não se gera link de material alheio.
 */
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { obterOuCriarShare, urlDoVideoShare } from "@/lib/politico/video-share";
import { createAdminClient } from "@/lib/supabase/admin";

export type LinkVideoResultado = { ok: true; url: string } | { ok: false; erro: string };

/**
 * Link rastreável de um vídeo. `contactId` nulo = link BASE da org (alcance
 * total); com contactId = link PESSOAL do multiplicador (alcance dele).
 */
export async function gerarLinkDeVideo(materialId: string, contactId?: string | null): Promise<LinkVideoResultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Organização não resolvida." };

  const admin = createAdminClient();
  const { data: mat } = await admin
    .from("pol_materiais")
    .select("id, ativo")
    .eq("organization_id", org.orgId)
    .eq("id", materialId)
    .maybeSingle();
  const m = mat as { id: string; ativo: boolean } | null;
  if (!m) return { ok: false, erro: "Vídeo não encontrado." };

  if (contactId) {
    const { data: c } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", org.orgId)
      .eq("id", contactId)
      .maybeSingle();
    if (!c) return { ok: false, erro: "Contato não encontrado." };
  }

  const id = await obterOuCriarShare(admin, { organizationId: org.orgId, materialId, contactId: contactId ?? null });
  if (!id) return { ok: false, erro: "Não foi possível gerar o link agora." };
  return { ok: true, url: urlDoVideoShare(id) };
}

/**
 * LINK DE VÍDEO RASTREÁVEL — mede o ALCANCE do multiplicador.
 *
 * Vídeos da biblioteca (pol_materiais tipo=video) são posts do Instagram:
 * compartilháveis por LINK (não dá pra anexar). Então cada vídeo ganha um link
 * rastreável — `/api/v1/vid/<shareId>` — que registra o clique e redireciona pro
 * post. O link pode ser da ORG (base, sharer nulo = alcance total do vídeo) ou
 * PESSOAL de um contato (sharer = o multiplicador → "alcançou Y").
 *
 * Alcance é ESTIMADO (clique ≠ pessoa com 100% de certeza): dedup por
 * visitante+dia tira o grosso do ruído; é honesto chamar de "alcance", não de
 * "pessoas". FAIL-SOFT: nunca lança.
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Base pública da instalação, p/ montar link absoluto fora de um request. */
function basePublica(): string {
  const u = env.NEXT_PUBLIC_APP_URL;
  const usavel = u && !u.includes("placeholder.invalid") ? u : "";
  return usavel.replace(/\/+$/, "");
}

/** `/api/v1/vid/<id>` absoluto se a base estiver configurada; senão relativo. */
export function urlDoVideoShare(shareId: string): string {
  const base = basePublica();
  return base ? `${base}/api/v1/vid/${shareId}` : `/api/v1/vid/${shareId}`;
}

/** Hash do visitante p/ dedup do clique (ip+ua+dia) — não guarda PII crua. */
export function hashVisitante(ip: string | null, ua: string | null): string {
  const dia = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip ?? "?"}|${ua ?? "?"}|${dia}`).digest("hex").slice(0, 32);
}

/**
 * Pega-ou-cria o share de um vídeo. `contactId` nulo = link BASE da org.
 * Retorna o `shareId` (ou null em falha). Trata corrida (23505 → relê).
 */
export async function obterOuCriarShare(
  admin: SupabaseClient,
  entrada: { organizationId: string; materialId: string; contactId: string | null },
): Promise<string | null> {
  const { organizationId, materialId, contactId } = entrada;
  const achar = () => {
    const q = admin
      .from("pol_video_shares")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("material_id", materialId);
    return (contactId ? q.eq("sharer_contact_id", contactId) : q.is("sharer_contact_id", null)).maybeSingle();
  };
  try {
    const { data: existente } = await achar();
    const jaId = (existente as { id: string } | null)?.id;
    if (jaId) return jaId;

    const { data, error } = await admin
      .from("pol_video_shares")
      .insert({ organization_id: organizationId, material_id: materialId, sharer_contact_id: contactId ?? null })
      .select("id")
      .maybeSingle();
    if (!error && data) return (data as { id: string }).id;
    if (error && error.code === "23505") {
      const { data: relido } = await achar();
      return (relido as { id: string } | null)?.id ?? null;
    }
    if (error) throw new Error(error.message);
    return null;
  } catch (err) {
    logger.warn("[video-share] obter/criar falhou", {
      organization_id: organizationId,
      detail: err instanceof Error ? err.message.slice(0, 120) : "?",
    });
    return null;
  }
}

/** Atalho: devolve a URL completa do link de vídeo (base ou pessoal). */
export async function linkDeVideo(
  admin: SupabaseClient,
  entrada: { organizationId: string; materialId: string; contactId: string | null },
): Promise<string | null> {
  const id = await obterOuCriarShare(admin, entrada);
  return id ? urlDoVideoShare(id) : null;
}

/**
 * Registra um clique (idempotente por visitante/dia). Chamado pelo redirect
 * público. Não lança; devolve se contou algo novo.
 */
export async function registrarCliqueVideo(
  admin: SupabaseClient,
  entrada: { shareId: string; organizationId: string; visitorHash: string },
): Promise<{ contou: boolean }> {
  try {
    const { error } = await admin.from("pol_video_cliques").insert({
      share_id: entrada.shareId,
      organization_id: entrada.organizationId,
      visitor_hash: entrada.visitorHash,
    });
    // 23505 = mesmo visitante/dia já contado: idempotente, não é erro.
    if (error && error.code !== "23505") throw new Error(error.message);
    return { contou: !error };
  } catch (err) {
    logger.warn("[video-share] registrar clique falhou", {
      detail: err instanceof Error ? err.message.slice(0, 120) : "?",
    });
    return { contou: false };
  }
}

/**
 * GET /api/v1/vid/[id] — redirect público do link de vídeo rastreável.
 *
 * Quem chega aqui é o NAVEGADOR de quem clicou no link que um multiplicador
 * compartilhou — nunca tem sessão nossa (daí estar em `public-paths`). O id é o
 * `pol_video_shares.id`; a org e o destino (o post do Instagram) vêm SÓ da linha
 * persistida, nunca do cliente. Registra o clique (dedup por visitante/dia) e
 * manda pro post. Falha de gravação não tira o redirect — o acesso vem primeiro.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { clientIp, paginaDeSaida } from "@/lib/plataformas-de-anuncio/pagina-de-captura";
import { hashVisitante, registrarCliqueVideo } from "@/lib/politico/video-share";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return paginaDeSaida(null);

  const ip = clientIp(req);
  // Sempre limita — inclusive sem IP (balde próprio), senão o teto seria pulável
  // só não mandando header de proxy.
  if (!(await checkRateLimit(`vid:${id.data}:${ip ?? "sem-ip"}`, 30, 60)).allowed) {
    return new NextResponse(null, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }

  const admin = createAdminClient();
  const { data: share } = await admin
    .from("pol_video_shares")
    .select("id, organization_id, material_id")
    .eq("id", id.data)
    .maybeSingle();
  const s = share as { id: string; organization_id: string; material_id: string } | null;
  if (!s) return paginaDeSaida(null);

  const { data: mat } = await admin
    .from("pol_materiais")
    .select("url, ativo")
    .eq("id", s.material_id)
    .maybeSingle();
  const m = mat as { url: string | null; ativo: boolean } | null;
  if (!m || !m.ativo || !m.url) return paginaDeSaida(null);

  // O destino é a URL do material (digitada por um membro do tenant). Só segue se
  // for http/https ABSOLUTA — senão o redirect viraria open-redirect com o domínio
  // da plataforma, ou `new URL` lançaria e devolveria 500 em vez do 404 neutro.
  let destino: string | null = null;
  try {
    const u = new URL(m.url);
    if (u.protocol === "http:" || u.protocol === "https:") destino = u.toString();
  } catch {
    destino = null;
  }
  if (!destino) return paginaDeSaida(null);

  // Conta o clique (best-effort, idempotente por visitante/dia). Não bloqueia o redirect.
  await registrarCliqueVideo(admin, {
    shareId: s.id,
    organizationId: s.organization_id,
    visitorHash: hashVisitante(ip, req.headers.get("user-agent")),
  });

  const response = paginaDeSaida(destino);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

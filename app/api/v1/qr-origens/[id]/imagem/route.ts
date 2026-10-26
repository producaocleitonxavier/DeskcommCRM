/**
 * GET /api/v1/qr-origens/:id/imagem — o QR code (PNG) do link wa.me da origem.
 *
 * Reusa a lib `qrcode` (já dependência). O número vem do canal da origem; se a
 * origem não fixou um, cai no número WAHA WORKING da organização.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import QRCode from "qrcode";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { montarLinkWaMe } from "@/lib/politico/qr-link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "qr-origens" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: o } = await supabase
    .from("pol_qr_origens")
    .select("codigo, mensagem, channel_session_id")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  const origem = o as { codigo: string; mensagem: string; channel_session_id: string | null } | null;
  if (!origem) return fail("not_found", t("Origem não encontrada."), 404, { requestId });

  // O número do link: o canal da origem, senão o WAHA WORKING da organização.
  let numero: string | null = null;
  if (origem.channel_session_id) {
    const { data: canal } = await supabase
      .from("channel_sessions")
      .select("phone_number")
      .eq("organization_id", authz.org.orgId)
      .eq("id", origem.channel_session_id)
      .maybeSingle();
    numero = (canal as { phone_number: string | null } | null)?.phone_number ?? null;
  }
  if (!numero) {
    const { data: canal } = await supabase
      .from("channel_sessions")
      .select("phone_number")
      .eq("organization_id", authz.org.orgId)
      .eq("provider", "waha")
      .eq("status", "WORKING")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    numero = (canal as { phone_number: string | null } | null)?.phone_number ?? null;
  }
  if (!numero) return fail("sem_numero", t("Nenhum número de WhatsApp conectado."), 409, { requestId });

  const link = montarLinkWaMe(numero, origem.mensagem, origem.codigo);
  const png = await QRCode.toBuffer(link, { width: 640, margin: 2, errorCorrectionLevel: "M" });

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": `inline; filename="qr-${origem.codigo}.png"`,
    },
  });
}

/**
 * Motor do card "Antes & Depois" (Situação Política / Vitórias).
 *
 * GET /app/politico/vitorias/[id]/card?antes=<anexoId>&depois=<anexoId>&l=<legenda>
 * → PNG vertical 9:16 (formato Stories) com a marca do mandato + ANTES|DEPOIS +
 * legenda. Montado server-side com next/og (Satori) — o SERVIDOR busca as fotos,
 * então não há problema de CORS. Zero dependência nova (mesmo motor do app/icon).
 *
 * Privado: vive sob /app (atrás do login). Confere org + que os anexos são DAQUELA
 * demanda (não dá pra injetar caminho arbitrário). Modo assistido: nada envia —
 * é só a imagem pra baixar.
 */

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const W = 1080;
const H = 1920;
const NAVY = "#0B1726";
const NAVY2 = "#14233A";
const LIME = "#D7F36A";
const CREME = "#F4F1E9";

async function assinar(admin: ReturnType<typeof createAdminClient>, bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function FotoCol({ rotulo, url, cor }: { rotulo: string; url: string | null; cor: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 486, alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: cor, marginRight: 10 }} />
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: 2, color: "#FFFFFF" }}>{rotulo}</span>
      </div>
      <div
        style={{
          display: "flex",
          width: 486,
          height: 620,
          borderRadius: 24,
          overflow: "hidden",
          background: "#1F3350",
          border: `3px solid ${cor}`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} width={486} height={620} style={{ width: 486, height: 620, objectFit: "cover" }} alt="" />
        ) : (
          <span style={{ fontSize: 26, color: "rgba(255,255,255,0.55)" }}>sem foto</span>
        )}
      </div>
    </div>
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return new Response("sem organização", { status: 403 });
  const { id } = await params;

  const sp = req.nextUrl.searchParams;
  const antesId = sp.get("antes") ?? "";
  const depoisId = sp.get("depois") ?? "";
  const legenda = (sp.get("l") ?? "").slice(0, 400);

  const admin = createAdminClient();

  // A demanda é da org? Puxa também os dados do rodapé/legenda.
  const { data: dem } = await admin
    .from("demandas")
    .select("id, assunto, pol_orgao_destino, pol_bairro, pol_municipio, aberta_em, fechada_em")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!dem) return new Response("demanda não encontrada", { status: 404 });

  // Os anexos escolhidos TÊM de ser daquela demanda (trava contra injeção de path).
  const ids = [antesId, depoisId].filter(Boolean);
  const { data: anexos } = ids.length
    ? await admin
        .from("pol_demanda_anexos")
        .select("id, storage_path")
        .eq("organization_id", org.orgId)
        .eq("demanda_id", id)
        .in("id", ids)
    : { data: [] as { id: string; storage_path: string }[] };
  const mapa = new Map((anexos ?? []).map((a) => [a.id, a.storage_path]));

  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, cidade, logo_path")
    .eq("organization_id", org.orgId)
    .maybeSingle();

  const [antesUrl, depoisUrl, logoUrl] = await Promise.all([
    assinar(admin, "gabinete-anexos", mapa.get(antesId) ?? null),
    assinar(admin, "gabinete-anexos", mapa.get(depoisId) ?? null),
    assinar(admin, "gabinete-identidade", (cfg?.logo_path as string | null) ?? null),
  ]);

  const nome = (cfg?.nome_parlamentar as string | null)?.trim() || "Gabinete";
  const cargo = (cfg?.cargo as string | null)?.trim() || "";
  const cidade = (cfg?.cidade as string | null) || (dem.pol_municipio as string | null) || "";
  const orgao = (dem.pol_orgao_destino as string | null)?.trim() || "";
  const bairro = (dem.pol_bairro as string | null)?.trim() || "";

  // Dias de resolução (aberta → fechada).
  let dias: number | null = null;
  if (dem.aberta_em && dem.fechada_em) {
    dias = Math.max(0, Math.round((new Date(dem.fechada_em as string).getTime() - new Date(dem.aberta_em as string).getTime()) / 86_400_000));
  }
  const textoPadrao = `${dem.assunto ?? "Demanda"} — resolvido${bairro ? ` no bairro ${bairro}` : ""}${orgao ? `, junto à ${orgao}` : ""}${dias !== null ? ` em ${dias} ${dias === 1 ? "dia" : "dias"}` : ""}.`;
  const corpo = legenda || textoPadrao;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: NAVY }}>
        {/* Cabeçalho: logo + nome do mandato */}
        <div style={{ display: "flex", alignItems: "center", padding: "56px 64px 24px 64px" }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} width={96} height={96} style={{ width: 96, height: 96, borderRadius: 20, objectFit: "cover", marginRight: 24 }} alt="" />
          ) : (
            <div style={{ display: "flex", width: 96, height: 96, borderRadius: 20, background: LIME, alignItems: "center", justifyContent: "center", marginRight: 24 }}>
              <span style={{ fontSize: 52, fontWeight: 800, color: NAVY }}>{nome.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 46, fontWeight: 800, color: "#FFFFFF" }}>{nome}</span>
            {(cargo || cidade) && (
              <span style={{ fontSize: 28, color: LIME, marginTop: 4 }}>{[cargo, cidade].filter(Boolean).join(" · ")}</span>
            )}
          </div>
        </div>

        {/* Faixa "Problema resolvido" */}
        <div style={{ display: "flex", padding: "8px 64px 20px 64px" }}>
          <div style={{ display: "flex", background: LIME, color: NAVY, fontSize: 30, fontWeight: 800, padding: "10px 24px", borderRadius: 999 }}>
            ✓ PROBLEMA RESOLVIDO
          </div>
        </div>

        {/* Fotos ANTES | DEPOIS */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 48px 0 48px" }}>
          <FotoCol rotulo="ANTES" url={antesUrl} cor="#F59E0B" />
          <FotoCol rotulo="DEPOIS" url={depoisUrl} cor={LIME} />
        </div>

        {/* Legenda */}
        <div style={{ display: "flex", flex: 1, padding: "40px 64px 0 64px" }}>
          <span style={{ fontSize: 40, lineHeight: 1.35, color: "#FFFFFF", fontWeight: 500 }}>{corpo}</span>
        </div>

        {/* Rodapé */}
        <div style={{ display: "flex", flexDirection: "column", background: NAVY2, padding: "28px 64px 48px 64px" }}>
          <div style={{ display: "flex", width: 120, height: 6, background: LIME, borderRadius: 3, marginBottom: 20 }} />
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: CREME }}>Gabinete {cargo ? `do ${cargo}` : ""} {nome}</span>
          </div>
          {(bairro || orgao) && (
            <span style={{ fontSize: 26, color: "rgba(244,241,233,0.65)", marginTop: 6 }}>
              {[bairro, orgao].filter(Boolean).join("  ·  ")}
            </span>
          )}
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}

/**
 * Motor do card "Antes & Depois" — ENCAIXE na moldura do mandato.
 *
 * GET /app/politico/vitorias/[id]/card?antes=<anexoId>&depois=<anexoId>
 * → PNG: as fotos encaixadas nas JANELAS TRANSPARENTES da moldura do gabinete.
 *
 * REGRA: a identidade é do GABINETE. O designer sobe a moldura (PNG 1080x1920 com
 * 2 áreas transparentes = Antes/Depois) em Identidade do Mandato. A ferramenta só
 * DETECTA as janelas transparentes (qualquer layout) e encaixa a foto perfeita:
 * recorta na orientação certa (EXIF via sharp) e no formato exato da janela
 * (a moldura vai POR CIMA, revelando a foto só onde é transparente).
 *
 * Esquerda/topo = Antes; direita/baixo = Depois. Sem texto nosso, sem fonte.
 */

import type { NextRequest } from "next/server";
import sharp from "sharp";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Admin = ReturnType<typeof createAdminClient>;
interface Janela {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function baixar(admin: Admin, bucket: string, path: string): Promise<Buffer | null> {
  const { data } = await admin.storage.from(bucket).download(path);
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Detecta as janelas transparentes da moldura (onde as fotos entram). Faz
 * rotulagem de componentes conexos (flood fill) sobre a máscara de alfa, numa
 * versão reduzida (rápido), e devolve as 2 maiores janelas — em coordenadas da
 * imagem cheia. Funciona com QUALQUER layout de molde.
 */
async function detectarJanelas(molduraBuf: Buffer, fullW: number, fullH: number): Promise<Janela[]> {
  const escala = 4;
  const dw = Math.max(1, Math.round(fullW / escala));
  const dh = Math.max(1, Math.round(fullH / escala));
  const { data, info } = await sharp(molduraBuf).ensureAlpha().resize(dw, dh, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels; // 4 (RGBA)
  const n = w * h;
  const transp = new Uint8Array(n);
  for (let i = 0; i < n; i++) transp[i] = data[i * ch + 3] < 40 ? 1 : 0;

  const visto = new Uint8Array(n);
  const pilha: number[] = [];
  const comps: { minx: number; miny: number; maxx: number; maxy: number; area: number }[] = [];
  for (let s = 0; s < n; s++) {
    if (!transp[s] || visto[s]) continue;
    let minx = w, miny = h, maxx = 0, maxy = 0, area = 0;
    pilha.length = 0;
    pilha.push(s);
    visto[s] = 1;
    while (pilha.length) {
      const p = pilha.pop()!;
      const px = p % w;
      const py = (p / w) | 0;
      area++;
      if (px < minx) minx = px;
      if (px > maxx) maxx = px;
      if (py < miny) miny = py;
      if (py > maxy) maxy = py;
      if (px > 0 && transp[p - 1] && !visto[p - 1]) { visto[p - 1] = 1; pilha.push(p - 1); }
      if (px < w - 1 && transp[p + 1] && !visto[p + 1]) { visto[p + 1] = 1; pilha.push(p + 1); }
      if (py > 0 && transp[p - w] && !visto[p - w]) { visto[p - w] = 1; pilha.push(p - w); }
      if (py < h - 1 && transp[p + w] && !visto[p + w]) { visto[p + w] = 1; pilha.push(p + w); }
    }
    comps.push({ minx, miny, maxx, maxy, area });
  }

  // Descarta ruído (< 0,5% da máscara) e um fundo transparente enorme (> 60%).
  const total = n;
  const boas = comps.filter((c) => c.area > total * 0.005 && c.area < total * 0.6).sort((a, b) => b.area - a.area);
  return boas.slice(0, 2).map((c) => ({
    x: Math.max(0, Math.round(c.minx * escala)),
    y: Math.max(0, Math.round(c.miny * escala)),
    w: Math.min(fullW, Math.round((c.maxx - c.minx + 1) * escala)),
    h: Math.min(fullH, Math.round((c.maxy - c.miny + 1) * escala)),
  }));
}

/** Ordena as 2 janelas: lado a lado → esquerda=Antes; empilhadas → topo=Antes. */
function ordenar(janelas: Janela[]): [Janela, Janela] {
  const [a, b] = janelas;
  const dx = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2));
  const dy = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2));
  if (dx >= dy) return a.x <= b.x ? [a, b] : [b, a];
  return a.y <= b.y ? [a, b] : [b, a];
}

async function fotoNaJanela(buf: Buffer, j: Janela): Promise<Buffer> {
  return sharp(buf).rotate().resize(j.w, j.h, { fit: "cover", position: "centre" }).png().toBuffer();
}

function erro(msg: string, status = 400): Response {
  return new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return erro("sem organização", 403);
  const { id } = await params;

  const sp = req.nextUrl.searchParams;
  const antesId = sp.get("antes") ?? "";
  const depoisId = sp.get("depois") ?? "";
  if (!antesId || !depoisId) return erro("Escolha a foto do Antes e a do Depois.", 422);

  const admin = createAdminClient();

  // A demanda é da org?
  const { data: dem } = await admin.from("demandas").select("id").eq("organization_id", org.orgId).eq("id", id).maybeSingle();
  if (!dem) return erro("demanda não encontrada", 404);

  // Moldura do mandato.
  const { data: cfg } = await admin.from("pol_gabinete_config").select("moldura_vitoria_path").eq("organization_id", org.orgId).maybeSingle();
  const molduraPath = (cfg?.moldura_vitoria_path as string | null) ?? null;
  if (!molduraPath) return erro("O gabinete ainda não subiu a moldura (Identidade do Mandato).", 409);

  // Anexos escolhidos TÊM de ser da demanda (trava anti-injeção).
  const { data: anexos } = await admin
    .from("pol_demanda_anexos")
    .select("id, storage_path")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", id)
    .in("id", [antesId, depoisId]);
  const mapa = new Map((anexos ?? []).map((a) => [a.id, a.storage_path]));
  const antesPath = mapa.get(antesId);
  const depoisPath = mapa.get(depoisId);
  if (!antesPath || !depoisPath) return erro("Fotos inválidas pra esta demanda.", 422);

  const [molduraBuf, antesBuf, depoisBuf] = await Promise.all([
    baixar(admin, "gabinete-identidade", molduraPath),
    baixar(admin, "gabinete-anexos", antesPath),
    baixar(admin, "gabinete-anexos", depoisPath),
  ]);
  if (!molduraBuf) return erro("Não consegui ler a moldura.", 500);
  if (!antesBuf || !depoisBuf) return erro("Não consegui ler as fotos.", 500);

  const meta = await sharp(molduraBuf).metadata();
  const fullW = meta.width ?? 1080;
  const fullH = meta.height ?? 1920;

  const janelas = await detectarJanelas(molduraBuf, fullW, fullH);
  if (janelas.length < 2) {
    return erro("Não encontrei 2 janelas transparentes na moldura. Confira se a arte tem 2 áreas transparentes (Antes/Depois).", 422);
  }
  const [jAntes, jDepois] = ordenar(janelas);

  const [fAntes, fDepois] = await Promise.all([fotoNaJanela(antesBuf, jAntes), fotoNaJanela(depoisBuf, jDepois)]);

  // Base (cobre tudo) → fotos nas janelas → moldura POR CIMA (revela só o transparente).
  const out = await sharp({ create: { width: fullW, height: fullH, channels: 4, background: { r: 17, g: 20, b: 26, alpha: 1 } } })
    .composite([
      { input: fAntes, top: jAntes.y, left: jAntes.x },
      { input: fDepois, top: jDepois.y, left: jDepois.x },
      { input: molduraBuf, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  return new Response(new Uint8Array(out), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}

/**
 * Motor do card "Antes & Depois" — ENCAIXE na moldura do mandato.
 *
 * GET /app/politico/vitorias/[id]/card?antes=<anexoId>&depois=<anexoId>
 * → PNG: as fotos encaixadas nas 2 JANELAS da moldura do gabinete.
 *
 * REGRA: a identidade é do GABINETE. O designer sobe a moldura (PNG 1080x1920 com
 * 2 janelas onde as fotos entram) em Identidade do Mandato. A ferramenta DETECTA
 * as janelas e encaixa a foto perfeita, EM QUALQUER LAYOUT — recorta na orientação
 * certa (EXIF via sharp) e no FORMATO EXATO da janela (reto/arredondado).
 *
 * A janela pode ser TRANSPARENTE (ideal) OU BRANCA (quando o designer exporta
 * achatado) — a ferramenta aceita as duas. A foto é RECORTADA no formato da janela
 * e vai POR CIMA da moldura. Esquerda/topo = Antes; direita/baixo = Depois.
 */

import type { NextRequest } from "next/server";
import sharp from "sharp";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Admin = ReturnType<typeof createAdminClient>;
interface Comp {
  id: number;
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
  area: number;
}

async function baixar(admin: Admin, bucket: string, path: string): Promise<Buffer | null> {
  const { data } = await admin.storage.from(bucket).download(path);
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** Ordena as 2 janelas: lado a lado → esquerda=Antes; empilhadas → topo=Antes. */
function ordenar(a: Comp, b: Comp): [Comp, Comp] {
  const dx = Math.abs((a.minx + a.maxx) / 2 - (b.minx + b.maxx) / 2);
  const dy = Math.abs((a.miny + a.maxy) / 2 - (b.miny + b.maxy) / 2);
  if (dx >= dy) return a.minx <= b.minx ? [a, b] : [b, a];
  return a.miny <= b.miny ? [a, b] : [b, a];
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

  const { data: dem } = await admin.from("demandas").select("id").eq("organization_id", org.orgId).eq("id", id).maybeSingle();
  if (!dem) return erro("demanda não encontrada", 404);

  const { data: cfg } = await admin.from("pol_gabinete_config").select("moldura_vitoria_path").eq("organization_id", org.orgId).maybeSingle();
  const molduraPath = (cfg?.moldura_vitoria_path as string | null) ?? null;
  if (!molduraPath) return erro("O gabinete ainda não subiu a moldura (Identidade do Mandato).", 409);

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

  // Moldura em pixels crus (RGBA, resolução cheia) — pra detectar as janelas.
  const { data, info } = await sharp(molduraBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const Hh = info.height;
  const ch = info.channels; // 4
  const n = W * Hh;

  // Máscara de JANELA: pixel TRANSPARENTE (alfa<40) OU CLARO NEUTRO (molde achatado
  // vira xadrez branco+cinza; pego os dois). Claro neutro = r,g,b todos altos — não
  // pega moldura dourada (azul baixo), vermelho nem verde. Depois a janela é
  // SOLIDIFICADA (preenche linha a linha) pra foto chapar sem xadrez vazar.
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * ch;
    const a = data[o + 3];
    const claro = data[o] > 140 && data[o + 1] > 140 && data[o + 2] > 140;
    if (a < 40 || claro) mask[i] = 1;
  }

  // Rotulagem de componentes conexos (flood fill) — acha as regiões das janelas.
  const label = new Int32Array(n); // 0 = sem rótulo
  const pilha: number[] = [];
  const comps: Comp[] = [];
  let atual = 0;
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue;
    atual++;
    let minx = W, miny = Hh, maxx = 0, maxy = 0, area = 0;
    pilha.length = 0;
    pilha.push(s);
    label[s] = atual;
    while (pilha.length) {
      const p = pilha.pop()!;
      const px = p % W;
      const py = (p / W) | 0;
      area++;
      if (px < minx) minx = px;
      if (px > maxx) maxx = px;
      if (py < miny) miny = py;
      if (py > maxy) maxy = py;
      if (px > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = atual; pilha.push(p - 1); }
      if (px < W - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = atual; pilha.push(p + 1); }
      if (py > 0 && mask[p - W] && !label[p - W]) { label[p - W] = atual; pilha.push(p - W); }
      if (py < Hh - 1 && mask[p + W] && !label[p + W]) { label[p + W] = atual; pilha.push(p + W); }
    }
    comps.push({ id: atual, minx, miny, maxx, maxy, area });
  }

  // As 2 maiores janelas (ignora ruído <2% e um fundo gigante >55%).
  const boas = comps.filter((c) => c.area > n * 0.02 && c.area < n * 0.55).sort((a, b) => b.area - a.area);
  if (boas.length < 2) {
    return erro("Não encontrei 2 janelas na moldura. As 2 áreas das fotos (Antes/Depois) precisam estar transparentes ou brancas.", 422);
  }
  const [cAntes, cDepois] = ordenar(boas[0]!, boas[1]!);

  // Recorta a foto no FORMATO EXATO da janela (usa a máscara do componente como
  // canal alfa) e devolve pronta pra compor na posição da janela.
  async function encaixar(buf: Buffer, c: Comp): Promise<{ input: Buffer; top: number; left: number }> {
    const bw = c.maxx - c.minx + 1;
    const bh = c.maxy - c.miny + 1;
    const alfa = new Uint8Array(bw * bh);
    // SOLIDIFICA a janela: em cada linha, preenche do primeiro ao último pixel da
    // janela (fecha os buracos do xadrez) — mantém o contorno arredondado, interior
    // cheio. A foto chapa o espaço inteiro.
    for (let y = 0; y < bh; y++) {
      const gy = (c.miny + y) * W;
      let lo = -1;
      let hi = -1;
      for (let x = 0; x < bw; x++) {
        if (label[gy + (c.minx + x)] === c.id) {
          if (lo < 0) lo = x;
          hi = x;
        }
      }
      if (lo >= 0) for (let x = lo; x <= hi; x++) alfa[y * bw + x] = 255;
    }
    const fotoRgb = await sharp(buf).rotate().resize(bw, bh, { fit: "cover", position: "centre" }).removeAlpha().raw().toBuffer();
    const recortada = await sharp(fotoRgb, { raw: { width: bw, height: bh, channels: 3 } })
      .joinChannel(Buffer.from(alfa), { raw: { width: bw, height: bh, channels: 1 } })
      .png()
      .toBuffer();
    return { input: recortada, top: c.miny, left: c.minx };
  }

  const [encAntes, encDepois] = await Promise.all([encaixar(antesBuf, cAntes), encaixar(depoisBuf, cDepois)]);

  // Base = a moldura; as fotos (já recortadas no formato das janelas) vão POR CIMA.
  const out = await sharp(molduraBuf).composite([encAntes, encDepois]).png().toBuffer();

  return new Response(new Uint8Array(out), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}

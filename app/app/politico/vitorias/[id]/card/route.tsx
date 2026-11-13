/**
 * Motor do card "Antes & Depois" — ENCAIXE na moldura do mandato.
 *
 * GET /app/politico/vitorias/[id]/card?antes=<anexoId>&depois=<anexoId>
 * → PNG: as 2 fotos encaixadas nas janelas da moldura do gabinete.
 *
 * O JEITO CERTO (pixel-perfeito): a foto vai POR TRÁS e a moldura POR CIMA — então
 * TUDO da arte (selos ANTES/DEPOIS, molduras, logo) fica sobre a foto e NADA é
 * coberto. A foto aparece só na janela.
 *
 * Funciona com molde TRANSPARENTE (ideal) E com molde ACHATADO (janelas brancas/
 * xadrez): detecta as 2 maiores janelas e as torna TRANSPARENTES antes de compor,
 * sem tocar nos selos (que são opacos e menores). Esquerda/topo = Antes.
 *
 * REGRA: a identidade é do GABINETE (sobe a moldura em Identidade do Mandato).
 */

import type { NextRequest } from "next/server";
import sharp from "sharp";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { caminhoPertenceAOrg } from "@/lib/storage/caminho-da-org";

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
  if (!caminhoPertenceAOrg(molduraPath, org.orgId)) return erro("Moldura inválida.", 422);

  const { data: anexos } = await admin
    .from("pol_demanda_anexos")
    .select("id, storage_path")
    .eq("organization_id", org.orgId)
    .eq("demanda_id", id)
    .in("id", [antesId, depoisId]);
  const mapa = new Map((anexos ?? []).map((a) => [a.id, a.storage_path]));
  const antesPath = mapa.get(antesId);
  const depoisPath = mapa.get(depoisId);
  if (!caminhoPertenceAOrg(antesPath, org.orgId) || !caminhoPertenceAOrg(depoisPath, org.orgId)) {
    return erro("Fotos inválidas pra esta demanda.", 422);
  }

  const [molduraBuf, antesBuf, depoisBuf] = await Promise.all([
    baixar(admin, "gabinete-identidade", molduraPath),
    baixar(admin, "gabinete-anexos", antesPath),
    baixar(admin, "gabinete-anexos", depoisPath),
  ]);
  if (!molduraBuf) return erro("Não consegui ler a moldura.", 500);
  if (!antesBuf || !depoisBuf) return erro("Não consegui ler as fotos.", 500);

  // Moldura em pixels crus (RGBA) — vou achar as janelas e, se precisar, abri-las.
  const { data, info } = await sharp(molduraBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const Hh = info.height;
  const ch = info.channels; // 4
  const n = W * Hh;

  // Máscara de JANELA: transparente (alfa<40) OU claro neutro (molde achatado =
  // xadrez branco+cinza; r,g,b todos >140 — não pega dourado/vermelho/verde).
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * ch;
    if (data[o + 3] < 40 || (data[o] > 140 && data[o + 1] > 140 && data[o + 2] > 140)) mask[i] = 1;
  }

  const label = new Int32Array(n);
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

  const boas = comps.filter((c) => c.area > n * 0.02 && c.area < n * 0.6).sort((a, b) => b.area - a.area);
  if (boas.length < 2) {
    return erro("Não encontrei 2 janelas na moldura. As 2 áreas das fotos (Antes/Depois) precisam estar transparentes ou brancas.", 422);
  }
  const [cAntes, cDepois] = ordenar(boas[0]!, boas[1]!);

  // ABRE as 2 janelas: solidifica cada uma (preenche linha a linha, fecha xadrez)
  // e zera o alfa ali → a foto vai aparecer por trás. Os selos (opacos, menores,
  // fora dessas 2 regiões) continuam intactos e POR CIMA.
  for (const c of [cAntes, cDepois]) {
    for (let y = c.miny; y <= c.maxy; y++) {
      const row = y * W;
      let lo = -1;
      let hi = -1;
      for (let x = c.minx; x <= c.maxx; x++) {
        if (label[row + x] === c.id) {
          if (lo < 0) lo = x;
          hi = x;
        }
      }
      if (lo >= 0) for (let x = lo; x <= hi; x++) data[(row + x) * ch + 3] = 0;
    }
  }
  const molduraAberta = await sharp(Buffer.from(data), { raw: { width: W, height: Hh, channels: ch } }).png().toBuffer();

  // Foto (cover) no tamanho do retângulo da janela — vai POR TRÁS.
  const fotoBbox = (buf: Buffer, c: Comp) =>
    sharp(buf).rotate().resize(c.maxx - c.minx + 1, c.maxy - c.miny + 1, { fit: "cover", position: "centre" }).png().toBuffer();
  const [fAntes, fDepois] = await Promise.all([fotoBbox(antesBuf, cAntes), fotoBbox(depoisBuf, cDepois)]);

  // Base transparente → fotos nas janelas → MOLDURA (com janelas abertas) POR CIMA.
  const out = await sharp({ create: { width: W, height: Hh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: fAntes, top: cAntes.miny, left: cAntes.minx },
      { input: fDepois, top: cDepois.miny, left: cDepois.minx },
      { input: molduraAberta, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  return new Response(new Uint8Array(out), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}

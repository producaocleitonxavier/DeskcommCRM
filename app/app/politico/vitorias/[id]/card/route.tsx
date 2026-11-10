/**
 * Motor do card "Antes & Depois" (Situação Política / Vitórias) — v1.1.
 *
 * GET /app/politico/vitorias/[id]/card?antes=&depois=&l=&modelo=&cor=
 * → PNG vertical 9:16 (Stories). Montado server-side com next/og (Satori).
 *
 * v1.1: (1) FOTO corrigida com `sharp` — gira pela orientação EXIF real e recorta
 * no quadro sem distorcer (o celular deita a foto; o Satori ignora o EXIF). (2) 3
 * MODELOS de arte (mandato/impacto/luz). (3) COR de fundo escolhível (a identidade
 * do mandato pode não ser a nossa). Logo vem de pol_gabinete_config.
 *
 * Privado (atrás do login), trava anexo→demanda→org. Nada envia — só a imagem.
 */

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import sharp from "sharp";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const W = 1080;
const H = 1920;
const LIME = "#D7F36A";

type Admin = ReturnType<typeof createAdminClient>;

/** Normaliza a foto no SERVIDOR: gira pela orientação real (EXIF) + recorta no
 * quadro (cover, sem distorcer) + vira JPG. Devolve data URL (sem rede no Satori). */
async function fotoData(admin: Admin, bucket: string, path: string | null, w: number, h: number): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await admin.storage.from(bucket).download(path);
    if (!data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    const out = await sharp(buf).rotate().resize(w, h, { fit: "cover", position: "centre" }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Logo: mantém proporção (contain), preserva transparência (PNG). */
async function logoData(admin: Admin, path: string | null, max: number): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await admin.storage.from("gabinete-identidade").download(path);
    if (!data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    const out = await sharp(buf).rotate().resize(max, max, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

function ehEscuro(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.52;
}
function validarCor(c: string | null, fallback: string): string {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
}
function clarear(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  const ch = (i: number) => Math.min(255, parseInt(h.slice(i, i + 2), 16) + amt).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

interface Dados {
  antes: string | null;
  depois: string | null;
  logo: string | null;
  nome: string;
  cargo: string;
  cidade: string;
  corpo: string;
  bairro: string;
  orgao: string;
  cor: string;
}

// ── MODELO 1: MANDATO (fundo = cor; sóbrio/institucional) ───────────────────
function Mandato(d: Dados) {
  const txt = ehEscuro(d.cor) ? "#FFFFFF" : "#14181F";
  const acento = ehEscuro(d.cor) ? LIME : "#14181F";
  const acentoTxt = ehEscuro(d.cor) ? "#14181F" : "#FFFFFF";
  const sub = ehEscuro(d.cor) ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.6)";
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: d.cor }}>
      <div style={{ display: "flex", alignItems: "center", padding: "56px 64px 20px 64px" }}>
        <Logo d={d} acento={acento} acentoTxt={acentoTxt} />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
          <span style={{ fontSize: 46, fontWeight: 800, color: txt }}>{d.nome}</span>
          {(d.cargo || d.cidade) && <span style={{ fontSize: 28, color: acento, marginTop: 4 }}>{[d.cargo, d.cidade].filter(Boolean).join(" · ")}</span>}
        </div>
      </div>
      <div style={{ display: "flex", padding: "6px 64px 18px 64px" }}>
        <div style={{ display: "flex", background: acento, color: acentoTxt, fontSize: 30, fontWeight: 800, padding: "10px 24px", borderRadius: 999 }}>✓ PROBLEMA RESOLVIDO</div>
      </div>
      <ParDeFotos d={d} corAntes="#F59E0B" corDepois={acento} rotuloCor={txt} />
      <div style={{ display: "flex", flex: 1, padding: "38px 64px 0 64px" }}>
        <span style={{ fontSize: 40, lineHeight: 1.35, color: txt, fontWeight: 500 }}>{d.corpo}</span>
      </div>
      <Rodape d={d} bg={ehEscuro(d.cor) ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)"} txt={txt} sub={sub} acento={acento} />
    </div>
  );
}

// ── MODELO 2: IMPACTO (preto + cor vibrante; bold/esportivo) ────────────────
function Impacto(d: Dados) {
  const BG = "#0B0B0D";
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: BG }}>
      <div style={{ display: "flex", height: 16, background: d.cor }} />
      <div style={{ display: "flex", alignItems: "center", padding: "40px 56px 10px 56px" }}>
        <Logo d={d} acento={d.cor} acentoTxt="#0B0B0D" />
        <span style={{ fontSize: 42, fontWeight: 800, color: "#FFFFFF", marginLeft: 20 }}>{d.nome}</span>
      </div>
      <div style={{ display: "flex", padding: "6px 56px 10px 56px" }}>
        <span style={{ fontSize: 76, fontWeight: 800, color: d.cor, letterSpacing: -1, textTransform: "uppercase" }}>Resolvido.</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 48px 0 48px" }}>
        <FotoBold rotulo="ANTES" url={d.antes} cor="#FFFFFF" />
        <FotoBold rotulo="DEPOIS" url={d.depois} cor={d.cor} />
      </div>
      <div style={{ display: "flex", flex: 1, padding: "36px 56px 0 56px" }}>
        <span style={{ fontSize: 38, lineHeight: 1.35, color: "#FFFFFF", fontWeight: 500 }}>{d.corpo}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", background: d.cor, padding: "26px 56px 44px 56px" }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: "#0B0B0D" }}>Gabinete {d.cargo ? `do ${d.cargo}` : ""} {d.nome}</span>
        {(d.bairro || d.orgao) && <span style={{ fontSize: 26, color: "rgba(11,11,13,0.7)", marginTop: 4 }}>{[d.bairro, d.orgao].filter(Boolean).join("  ·  ")}</span>}
      </div>
    </div>
  );
}

// ── MODELO 3: LUZ (claro/editorial; cor como acento) ────────────────────────
function Luz(d: Dados) {
  const BG = "#F6F4EE";
  const txt = "#16202B";
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: BG }}>
      <div style={{ display: "flex", alignItems: "center", padding: "56px 64px 16px 64px" }}>
        <Logo d={d} acento={d.cor} acentoTxt="#FFFFFF" />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
          <span style={{ fontSize: 46, fontWeight: 800, color: txt }}>{d.nome}</span>
          {(d.cargo || d.cidade) && <span style={{ fontSize: 28, color: d.cor, marginTop: 4 }}>{[d.cargo, d.cidade].filter(Boolean).join(" · ")}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", padding: "0 64px 14px 64px" }}>
        <div style={{ display: "flex", width: 60, height: 8, background: d.cor, borderRadius: 4, marginRight: 16 }} />
        <span style={{ fontSize: 30, fontWeight: 800, color: d.cor, letterSpacing: 2 }}>PROBLEMA RESOLVIDO</span>
      </div>
      <ParDeFotos d={d} corAntes="#C2410C" corDepois={d.cor} rotuloCor={txt} />
      <div style={{ display: "flex", flex: 1, padding: "38px 64px 0 64px" }}>
        <span style={{ fontSize: 40, lineHeight: 1.38, color: txt, fontWeight: 500 }}>{d.corpo}</span>
      </div>
      <Rodape d={d} bg="rgba(0,0,0,0.04)" txt={txt} sub="rgba(0,0,0,0.5)" acento={d.cor} />
    </div>
  );
}

// ── MODELO 4: GRADIENTE (vibrante/comemorativo; molduras + selos) ───────────
function Gradiente(d: Dados) {
  const bg = `linear-gradient(145deg, ${d.cor}, ${clarear(d.cor, 78)})`;
  const txt = ehEscuro(d.cor) ? "#FFFFFF" : "#14181F";
  const foto = (url: string | null, rotulo: string, pill: string, raio: Record<string, number>) => (
    <div style={{ display: "flex", flexDirection: "column", width: 466, alignItems: "center" }}>
      <div style={{ display: "flex", width: 466, height: 600, overflow: "hidden", background: "#1A1A1F", border: "5px solid rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", ...raio }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} width={466} height={600} style={{ width: 466, height: 600 }} alt="" />
        ) : (
          <span style={{ fontSize: 26, color: "rgba(255,255,255,0.55)" }}>sem foto</span>
        )}
      </div>
      <div style={{ display: "flex", marginTop: -32 }}>
        <div style={{ display: "flex", background: pill, color: "#FFFFFF", fontSize: 32, fontWeight: 800, letterSpacing: 2, padding: "10px 30px", borderRadius: 999 }}>{rotulo}</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: bg }}>
      <div style={{ display: "flex", alignItems: "center", padding: "54px 64px 14px 64px" }}>
        <Logo d={d} acento="#FFFFFF" acentoTxt={d.cor} />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
          <span style={{ fontSize: 46, fontWeight: 800, color: txt }}>{d.nome}</span>
          {(d.cargo || d.cidade) && <span style={{ fontSize: 28, color: txt, opacity: 0.85, marginTop: 4 }}>{[d.cargo, d.cidade].filter(Boolean).join(" · ")}</span>}
        </div>
      </div>
      <div style={{ display: "flex", padding: "6px 64px 22px 64px" }}>
        <div style={{ display: "flex", background: "#FFFFFF", color: d.cor, fontSize: 30, fontWeight: 800, padding: "10px 24px", borderRadius: 999 }}>✓ PROBLEMA RESOLVIDO</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 60px 0 60px" }}>
        {foto(d.antes, "ANTES", "#F97316", { borderTopLeftRadius: 120, borderTopRightRadius: 28, borderBottomRightRadius: 120, borderBottomLeftRadius: 28 })}
        {foto(d.depois, "DEPOIS", "#1D4ED8", { borderTopLeftRadius: 28, borderTopRightRadius: 120, borderBottomRightRadius: 28, borderBottomLeftRadius: 120 })}
      </div>
      <div style={{ display: "flex", flex: 1, padding: "44px 64px 0 64px" }}>
        <span style={{ fontSize: 40, lineHeight: 1.35, color: txt, fontWeight: 600 }}>{d.corpo}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: "0 64px 48px 64px" }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: txt }}>Gabinete {d.cargo ? `do ${d.cargo}` : ""} {d.nome}</span>
        {(d.bairro || d.orgao) && <span style={{ fontSize: 26, color: txt, opacity: 0.7, marginTop: 6 }}>{[d.bairro, d.orgao].filter(Boolean).join("  ·  ")}</span>}
      </div>
    </div>
  );
}

// ── MODELO 5: MOLDURA (painel escuro com frame na cor; elegante) ────────────
function Moldura(d: Dados) {
  const BG = ehEscuro(d.cor) ? d.cor : "#101D30";
  const acento = ehEscuro(d.cor) ? LIME : d.cor;
  return (
    <div style={{ display: "flex", width: W, height: H, background: BG, padding: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, border: `3px solid ${acento}`, borderRadius: 36, padding: "44px 48px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Logo d={d} acento={acento} acentoTxt={ehEscuro(acento) ? "#FFFFFF" : "#0B0B0D"} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 22 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: "#FFFFFF" }}>{d.nome}</span>
            {(d.cargo || d.cidade) && <span style={{ fontSize: 26, color: acento, marginTop: 4 }}>{[d.cargo, d.cidade].filter(Boolean).join(" · ")}</span>}
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 22 }}>
          <div style={{ display: "flex", background: acento, color: ehEscuro(acento) ? "#FFFFFF" : "#0B0B0D", fontSize: 28, fontWeight: 800, padding: "8px 22px", borderRadius: 999 }}>✓ RESOLVIDO</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
          {[
            { r: "ANTES", u: d.antes },
            { r: "DEPOIS", u: d.depois },
          ].map((f) => (
            <div key={f.r} style={{ display: "flex", flexDirection: "column", width: 430, alignItems: "center" }}>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "#FFFFFF", marginBottom: 10 }}>{f.r}</span>
              <FotoBox url={f.u} w={430} h={560} borda={acento} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flex: 1, marginTop: 30 }}>
          <span style={{ fontSize: 36, lineHeight: 1.35, color: "#FFFFFF", fontWeight: 500 }}>{d.corpo}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 110, height: 6, background: acento, borderRadius: 3, marginBottom: 14 }} />
          <span style={{ fontSize: 28, fontWeight: 700, color: "#FFFFFF" }}>Gabinete {d.cargo ? `do ${d.cargo}` : ""} {d.nome}</span>
          {(d.bairro || d.orgao) && <span style={{ fontSize: 24, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{[d.bairro, d.orgao].filter(Boolean).join("  ·  ")}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Peças compartilhadas ────────────────────────────────────────────────────
function Logo({ d, acento, acentoTxt }: { d: Dados; acento: string; acentoTxt: string }) {
  if (d.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={d.logo} width={100} height={100} style={{ width: 100, height: 100, objectFit: "contain", borderRadius: 16 }} alt="" />;
  }
  return (
    <div style={{ display: "flex", width: 100, height: 100, borderRadius: 20, background: acento, alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 54, fontWeight: 800, color: acentoTxt }}>{d.nome.charAt(0).toUpperCase()}</span>
    </div>
  );
}

function FotoBox({ url, w, h, borda }: { url: string | null; w: number; h: number; borda: string }) {
  return (
    <div style={{ display: "flex", width: w, height: h, borderRadius: 20, overflow: "hidden", background: "#1A1A1F", border: `4px solid ${borda}`, alignItems: "center", justifyContent: "center" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} width={w} height={h} style={{ width: w, height: h }} alt="" />
      ) : (
        <span style={{ fontSize: 26, color: "rgba(255,255,255,0.55)" }}>sem foto</span>
      )}
    </div>
  );
}

function ParDeFotos({ d, corAntes, corDepois, rotuloCor }: { d: Dados; corAntes: string; corDepois: string; rotuloCor: string }) {
  const w = 460;
  const h = 600;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 64px 0 64px" }}>
      {[
        { r: "ANTES", u: d.antes, c: corAntes },
        { r: "DEPOIS", u: d.depois, c: corDepois },
      ].map((f) => (
        <div key={f.r} style={{ display: "flex", flexDirection: "column", width: w, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: f.c, marginRight: 10 }} />
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, color: rotuloCor }}>{f.r}</span>
          </div>
          <FotoBox url={f.u} w={w} h={h} borda={f.c} />
        </div>
      ))}
    </div>
  );
}

function FotoBold({ rotulo, url, cor }: { rotulo: string; url: string | null; cor: string }) {
  const w = 468;
  const h = 560;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: w }}>
      <FotoBox url={url} w={w} h={h} borda={cor} />
      <div style={{ display: "flex", justifyContent: "center", marginTop: -34 }}>
        <div style={{ display: "flex", background: cor, color: cor === "#FFFFFF" ? "#0B0B0D" : "#0B0B0D", fontSize: 34, fontWeight: 800, letterSpacing: 2, padding: "8px 28px", borderRadius: 999 }}>{rotulo}</div>
      </div>
    </div>
  );
}

function Rodape({ d, bg, txt, sub, acento }: { d: Dados; bg: string; txt: string; sub: string; acento: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: bg, padding: "28px 64px 48px 64px" }}>
      <div style={{ display: "flex", width: 120, height: 6, background: acento, borderRadius: 3, marginBottom: 18 }} />
      <span style={{ fontSize: 30, fontWeight: 700, color: txt }}>Gabinete {d.cargo ? `do ${d.cargo}` : ""} {d.nome}</span>
      {(d.bairro || d.orgao) && <span style={{ fontSize: 26, color: sub, marginTop: 6 }}>{[d.bairro, d.orgao].filter(Boolean).join("  ·  ")}</span>}
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
  const modelo = sp.get("modelo") ?? "mandato";
  const corPadrao = modelo === "luz" || modelo === "gradiente" ? "#16A34A" : modelo === "impacto" ? "#D7F36A" : "#0B1726";
  const cor = validarCor(sp.get("cor"), corPadrao);

  const admin = createAdminClient();

  const { data: dem } = await admin
    .from("demandas")
    .select("id, assunto, pol_orgao_destino, pol_bairro, pol_municipio, aberta_em, fechada_em")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!dem) return new Response("demanda não encontrada", { status: 404 });

  const ids = [antesId, depoisId].filter(Boolean);
  const { data: anexos } = ids.length
    ? await admin.from("pol_demanda_anexos").select("id, storage_path").eq("organization_id", org.orgId).eq("demanda_id", id).in("id", ids)
    : { data: [] as { id: string; storage_path: string }[] };
  const mapa = new Map((anexos ?? []).map((a) => [a.id, a.storage_path]));

  const { data: cfg } = await admin
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo, cidade, logo_path")
    .eq("organization_id", org.orgId)
    .maybeSingle();

  // Dimensões 2x da exibição (nitidez). Impacto usa um corte um pouco mais baixo.
  const fw = modelo === "impacto" ? 936 : 920;
  const fh = modelo === "impacto" ? 1120 : 1200;
  const [antes, depois, logo] = await Promise.all([
    fotoData(admin, "gabinete-anexos", mapa.get(antesId) ?? null, fw, fh),
    fotoData(admin, "gabinete-anexos", mapa.get(depoisId) ?? null, fw, fh),
    logoData(admin, (cfg?.logo_path as string | null) ?? null, 200),
  ]);

  const nome = (cfg?.nome_parlamentar as string | null)?.trim() || "Gabinete";
  const cargo = (cfg?.cargo as string | null)?.trim() || "";
  const cidade = (cfg?.cidade as string | null) || (dem.pol_municipio as string | null) || "";
  const orgao = (dem.pol_orgao_destino as string | null)?.trim() || "";
  const bairro = (dem.pol_bairro as string | null)?.trim() || "";

  let diasTxt = "";
  if (dem.aberta_em && dem.fechada_em) {
    const dias = Math.max(0, Math.round((new Date(dem.fechada_em as string).getTime() - new Date(dem.aberta_em as string).getTime()) / 86_400_000));
    diasTxt = dias === 0 ? " no mesmo dia" : ` em ${dias} ${dias === 1 ? "dia" : "dias"}`;
  }
  const textoPadrao = `${dem.assunto ?? "Demanda"} — resolvido${bairro ? ` no bairro ${bairro}` : ""}${orgao ? `, junto à ${orgao}` : ""}${diasTxt}.`;

  const dados: Dados = { antes, depois, logo, nome, cargo, cidade, corpo: legenda || textoPadrao, bairro, orgao, cor };
  const jsx =
    modelo === "impacto" ? Impacto(dados)
    : modelo === "luz" ? Luz(dados)
    : modelo === "gradiente" ? Gradiente(dados)
    : modelo === "moldura" ? Moldura(dados)
    : Mandato(dados);

  return new ImageResponse(jsx, { width: W, height: H });
}

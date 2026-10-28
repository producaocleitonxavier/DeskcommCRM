/**
 * /m/[id] — PÁGINA PÚBLICA de um material (ebook/PDF) — Opção B da "capa no WhatsApp".
 *
 * O WhatsApp (e redes) mostra um PREVIEW com a CAPA quando o link apontado tem
 * tags OpenGraph — coisa que um link direto pro PDF não tem. Então o link que vai
 * na mensagem passa a ser ESTE (`/m/<id>`): ele carrega `og:image = capa_url` do
 * material e um botão pra baixar o PDF. Sem API Oficial, sem enviar mídia.
 *
 * Público (sem auth, como transparência/pesquisa). A org não aparece; só o
 * material ATIVO, resolvido pelo id no servidor.
 */

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Material {
  titulo: string;
  descricao: string | null;
  url: string;
  capa_url: string | null;
  ativo: boolean;
}

async function buscarMaterial(id: string): Promise<Material | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("pol_materiais")
    .select("titulo, descricao, url, capa_url, ativo")
    .eq("id", id)
    .maybeSingle();
  const m = data as Material | null;
  return m && m.ativo ? m : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const m = await buscarMaterial(id);
  if (!m) return { title: "Material" };
  const desc = m.descricao ?? "Material gratuito — conteúdo de valor direto pra você.";
  const imgs = m.capa_url ? [{ url: m.capa_url }] : [];
  return {
    title: m.titulo,
    description: desc,
    openGraph: { title: m.titulo, description: desc, images: imgs, type: "website" },
    twitter: { card: "summary_large_image", title: m.titulo, description: desc, images: m.capa_url ? [m.capa_url] : [] },
  };
}

export default async function MaterialPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const m = await buscarMaterial(id);

  const wrap: React.CSSProperties = {
    minHeight: "100dvh",
    background: "#0B0D11",
    color: "#E9EBF0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 16px",
    textAlign: "center",
  };

  if (!m) {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>Material indisponível</h1>
        <p style={{ color: "#9AA0AE", marginTop: 8, fontSize: 14 }}>Este link não existe mais ou foi desativado.</p>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {m.capa_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.capa_url}
            alt={m.titulo}
            style={{ width: "100%", maxWidth: 320, borderRadius: 16, margin: "0 auto 24px", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}
          />
        )}
        <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{m.titulo}</h1>
        {m.descricao && <p style={{ color: "#9AA0AE", marginTop: 10, fontSize: 15, lineHeight: 1.5 }}>{m.descricao}</p>}
        <a
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 24,
            padding: "14px 28px",
            borderRadius: 999,
            background: "#D7F36A",
            color: "#1B2206",
            fontSize: 16,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          📘 Baixar o material
        </a>
        <p style={{ color: "#5B6170", fontSize: 12, marginTop: 20 }}>Conteúdo gratuito do mandato.</p>
      </div>
    </div>
  );
}

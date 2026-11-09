/**
 * /perfil/[token] — formulário PÚBLICO de perfilamento progressivo (sem auth).
 *
 * O token opaco (contacts.perfil_token) identifica o contato → o formulário já
 * sabe de quem é, sem pedir WhatsApp de novo. Coleta cidade, bairro e aniversário
 * (dia/mês, sem ano). Força-dynamic + admin client, como as outras páginas
 * públicas (pesquisa/transparência).
 */
import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";
import { PerfilForm } from "./_perfil-form";

export const dynamic = "force-dynamic";
// `openGraph.images: []` de propósito: sem foto na prévia do WhatsApp (o cliente
// não quer card com imagem — o link é só pra abrir o formulário). robots noindex
// porque é página por-contato, não conteúdo de busca.
export const metadata: Metadata = {
  title: "Complete seu perfil",
  robots: { index: false },
  openGraph: { title: "Complete seu perfil", images: [] },
};

interface Contato {
  id: string;
  name: string | null;
  custom_fields: Record<string, unknown> | null;
  birthdate: string | null;
}

async function buscar(token: string): Promise<Contato | null> {
  if (!token || token.length < 16) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("contacts")
    .select("id, name, custom_fields, birthdate")
    .eq("perfil_token", token)
    .maybeSingle();
  return (data as Contato | null) ?? null;
}

export default async function PerfilPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contato = await buscar(token);

  const cf = (contato?.custom_fields ?? {}) as Record<string, unknown>;
  const cidade = typeof cf.cidade === "string" ? cf.cidade : "";
  const bairro = typeof cf.bairro === "string" ? cf.bairro : "";
  // birthdate "2000-09-14" → dia 14, mês 9 (o ano é sentinela, ignorado).
  let dia = "";
  let mes = "";
  if (contato?.birthdate && /^\d{4}-\d{2}-\d{2}$/.test(contato.birthdate)) {
    const [, m, d] = contato.birthdate.split("-");
    dia = String(Number(d));
    mes = String(Number(m));
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "radial-gradient(1000px 500px at 50% -10%, #16304d, #0b1726)",
        color: "#eaf0f6",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        {!contato ? (
          <div
            style={{
              background: "#13233a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 18,
              padding: "32px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔗</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Link indisponível</h1>
            <p style={{ color: "#a7b6c9", fontSize: 14, margin: 0 }}>
              Este link de perfil não é mais válido. Se precisar, peça um novo pela conversa no WhatsApp.
            </p>
          </div>
        ) : (
          <PerfilForm
            token={token}
            primeiroNome={(contato.name ?? "").trim().split(" ")[0] ?? ""}
            cidadeInicial={cidade}
            bairroInicial={bairro}
            diaInicial={dia}
            mesInicial={mes}
          />
        )}
      </div>
    </main>
  );
}

/**
 * /avaliar/[token] — Nota do cidadão (página PÚBLICA, sem login).
 *
 * O link vai no aviso de resolução/encerramento da demanda. O token opaco
 * (demandas.pol_avaliacao_token) identifica a demanda; a pessoa toca numa nota
 * de 1 a 5 e, se quiser, escreve uma frase. Uma resposta por demanda.
 * Força-dynamic + admin client, como /perfil/[token].
 */
import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";
import { AvaliarForm } from "./_avaliar-form";

export const dynamic = "force-dynamic";
// Sem imagem na prévia do WhatsApp e fora de busca: é página por-atendimento.
export const metadata: Metadata = {
  title: "Como foi o atendimento?",
  robots: { index: false },
  openGraph: { title: "Como foi o atendimento?", images: [] },
};

interface Achado {
  organization_id: string;
  pol_avaliacao_nota: number | null;
  contacts: { name: string | null } | null;
}

async function buscar(token: string): Promise<{ achado: Achado; gabinete: string } | null> {
  if (!/^[0-9a-f]{32}$/i.test(token)) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("demandas")
    .select("organization_id, pol_avaliacao_nota, contacts(name)")
    .eq("pol_avaliacao_token", token)
    .maybeSingle();
  const achado = data as unknown as Achado | null;
  if (!achado) return null;
  const { data: gab } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo")
    .eq("organization_id", achado.organization_id)
    .maybeSingle();
  const nome = ((gab?.nome_parlamentar as string | null) ?? "").trim();
  const cargo = ((gab?.cargo as string | null) ?? "").trim();
  return { achado, gabinete: nome ? `gabinete do ${cargo ? cargo + " " : ""}${nome}` : "nosso gabinete" };
}

const cartao: React.CSSProperties = {
  background: "#13233a",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 18,
  padding: "32px 24px",
  textAlign: "center",
};

export default async function AvaliarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await buscar(token);

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
        {!r ? (
          <div style={cartao}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Link indisponível</h1>
            <p style={{ color: "#a7b6c9", fontSize: 14, margin: 0 }}>
              Este link de avaliação não é mais válido. Se quiser falar com a gente, é só responder pela conversa no WhatsApp.
            </p>
          </div>
        ) : r.achado.pol_avaliacao_nota !== null ? (
          <div style={{ ...cartao, border: "1px solid rgba(215,243,106,0.4)" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Você já avaliou</h1>
            <p style={{ color: "#a7b6c9", fontSize: 15, margin: 0 }}>
              Recebemos a sua resposta. Obrigado por ajudar o {r.gabinete} a atender melhor.
            </p>
          </div>
        ) : (
          <AvaliarForm
            token={token}
            primeiroNome={(r.achado.contacts?.name ?? "").trim().split(/\s+/)[0] ?? ""}
            gabinete={r.gabinete}
          />
        )}
      </div>
    </main>
  );
}

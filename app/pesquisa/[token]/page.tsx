/**
 * /pesquisa/[token] — PÁGINA PÚBLICA de resposta a uma pesquisa política.
 *
 * Sem autenticação (formulário aberto, como o portal da transparência). Resolve a
 * pesquisa ATIVA pelo public_token e renderiza o formulário. O envio vai para
 * POST /api/v1/pol-surveys/public/[token]. Fecha o buraco achado na varredura: o
 * admin tinha o token mas não havia onde o cidadão respondesse.
 */

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import PesquisaForm, { type Pergunta } from "./_pesquisa-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pesquisa" };

interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: string;
}

async function buscar(token: string): Promise<{ survey: Survey; perguntas: Pergunta[] } | null> {
  const db = createAdminClient();
  const { data: survey } = await db
    .from("pol_surveys")
    .select("id, title, description, status")
    .eq("public_token", token)
    .eq("status", "active")
    .maybeSingle();
  if (!survey) return null;

  const { data: perguntas } = await db
    .from("pol_survey_questions")
    .select('id, question, response_type, options, required, "order"')
    .eq("survey_id", (survey as Survey).id)
    .order("order", { ascending: true });

  return { survey: survey as Survey, perguntas: (perguntas ?? []) as Pergunta[] };
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "#0B0D11", color: "#E9EBF0", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: 620 }}>{children}</div>
    </div>
  );
}

export default async function PesquisaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const dados = await buscar(token);

  if (!dados) {
    return (
      <Moldura>
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>Pesquisa indisponível</h1>
          <p style={{ color: "#9AA0AE", marginTop: 8, fontSize: 14 }}>
            Este link não existe ou a pesquisa foi encerrada. Confira o endereço com quem o enviou.
          </p>
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <PesquisaForm token={token} titulo={dados.survey.title} descricao={dados.survey.description} perguntas={dados.perguntas} />
    </Moldura>
  );
}

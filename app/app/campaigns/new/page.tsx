import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { NovaCampanha } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo disparo" };

/** Rótulos amigáveis para as origens técnicas da base (SaaS: humaniza o resto). */
const ROTULO_ORIGEM: Record<string, string> = {
  abaixo_assinado: "Abaixo-assinado",
  saga_palestras: "Palestras",
  campo: "Campo (rua)",
  sindicato_policia_civil: "Sindicato Polícia Civil",
  conselheiros_tutelares: "Conselheiros Tutelares",
  gabinete: "Gabinete",
  solene_policiacivil: "Solene Polícia Civil",
  ebook_seguranca_escolar: "Ebook Segurança Escolar",
  ebook_protecao_digital: "Ebook Proteção Digital",
  lp_pedofilia: "Proteção (landing)",
  importacao: "Importação",
  manual: "Cadastro manual",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

function humanizar(v: string): string {
  return (
    ROTULO_ORIGEM[v] ??
    v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export default async function NovaCampanhaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();

  // Materiais ativos (biblioteca) para a entrega na resposta.
  const { data: mats } = await db
    .from("pol_materiais")
    .select("id, titulo, tipo")
    .eq("organization_id", org.orgId)
    .eq("ativo", true)
    .order("titulo", { ascending: true });
  const materiais = (mats ?? []) as { id: string; titulo: string; tipo: string }[];

  // Origens da base COM contagem: head-count por origem conhecida (bounded,
  // exato). A seleção clicável que o cliente pediu em vez de texto solto.
  const candidatas = Object.keys(ROTULO_ORIGEM);
  const contagens = await Promise.all(
    candidatas.map(async (src) => {
      const { count } = await db
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.orgId)
        .eq("source", src);
      return { value: src, label: humanizar(src), total: count ?? 0 };
    }),
  );
  const origens = contagens.filter((o) => o.total > 0).sort((a, b) => b.total - a.total);

  return <NovaCampanha materiais={materiais} origens={origens} />;
}

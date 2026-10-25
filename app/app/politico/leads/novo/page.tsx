/**
 * /app/politico/leads/novo — Novo cadastro (War Room 2.0)
 *
 * Formulário para cadastrar uma nova pessoa na base política.
 * Cria o contact + pol_lead em sequência via API.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import NovoCadastroForm from "./form";

export const dynamic = "force-dynamic";

export default async function NovoCadastroPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  return (
    <div className="mx-auto max-w-[720px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Base · Pessoas"
        titulo="Novo cadastro"
        subtitulo="Preencha os dados para adicionar uma nova pessoa à base."
        acoes={[{ href: "/app/politico/leads", label: "← Pessoas" }]}
      />
      <NovoCadastroForm />
    </div>
  );
}

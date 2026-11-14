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
import { roleAtLeast } from "@/lib/auth/types";
import { CommandHero } from "@/components/politico/command-hero";
import NovoCadastroForm from "./form";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";

export default async function NovoCadastroPage() {
  await exigirAcessoPolitico("pessoas");
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  // Só político/admin classifica no TOPO dos níveis (Multiplicador).
  // Assessor vai até Participante — não pode inflar a base com topo de opinião.
  const podeTopoFunil = roleAtLeast(org.role, "admin");

  return (
    <div className="mx-auto max-w-[720px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Base · Pessoas"
        titulo="Novo cadastro"
        subtitulo="Preencha os dados para adicionar uma nova pessoa à base."
        acoes={[{ href: "/app/politico/leads", label: "← Pessoas" }]}
      />
      <NovoCadastroForm podeTopoFunil={podeTopoFunil} />
    </div>
  );
}

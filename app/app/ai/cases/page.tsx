import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { CommandHero } from "@/components/politico/command-hero";
import { CaseList } from "./_components/CaseList";
import { exigirPortaDoPerfil } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  await exigirPortaDoPerfil("/app/ai/cases");
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // GET/POST de /api/v1/ai/cases exigem role agent+ (requireRole("agent")) —
  // abaixo disso a rota nem devolve dado, então a tela inteira gate aqui.
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.agent) redirect("/app");

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CommandHero
        eyebrow="Atendimento · Casos"
        titulo="Casos"
        subtitulo="Quando a IA trava em algo que só um humano resolve, ela abre um caso aqui — e continua conversando com a pessoa enquanto espera sua resposta."
      />
      <CaseList />
    </div>
  );
}

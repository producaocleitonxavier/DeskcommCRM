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
        eyebrow="Conversas · Precisa de gente"
        titulo="Precisa de gente"
        subtitulo="Quando o assistente não consegue resolver sozinho, ele deixa o caso aqui e segue conversando com a pessoa enquanto espera a sua resposta."
      />
      <CaseList />
    </div>
  );
}

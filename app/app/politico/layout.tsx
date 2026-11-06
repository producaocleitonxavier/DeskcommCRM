/**
 * Layout do módulo político (War Room 2.0) — envolve TODAS as rotas de
 * /app/politico/* no WarRoomShell, que ativa o tema "Sala de Guerra". Um único
 * ponto em vez de envolver cada page.tsx, com o mesmo efeito e sem afetar o
 * resto do DeskcommCRM.
 *
 * TEMA por ORGANIZAÇÃO (9091+): lê `organizations.settings.tema`. Quando a org
 * escolhe `claro`, o shell entra em Marinho (tema claro escopado) — é assim que
 * uma instalação liga a identidade clara só pra ela, sem tocar nas outras. O
 * default (sem a chave) é o escuro tático de sempre. Falha-fecha no escuro: se a
 * leitura quebrar, mantém o dark (nunca pisca uma tela meio-clara por erro).
 */

import WarRoomShell from "@/components/politico/war-room-shell";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export default async function PoliticoLayout({ children }: { children: React.ReactNode }) {
  let claro = false;
  try {
    const user = await requireAuth();
    const org = await resolveActiveOrg(user);
    if (org) {
      const db = await createClient();
      const { data } = await db
        .from("organizations")
        .select("settings")
        .eq("id", org.orgId)
        .maybeSingle();
      const settings = (data?.settings ?? null) as { tema?: unknown } | null;
      claro = settings?.tema === "claro";
    }
  } catch {
    claro = false;
  }
  return <WarRoomShell claro={claro}>{children}</WarRoomShell>;
}

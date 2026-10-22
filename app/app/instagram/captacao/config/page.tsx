/**
 * /app/instagram/captacao/config — Personalização da captação do Instagram.
 *
 * Cada candidato configura a própria região-alvo e os textos do flow. O Kanban
 * e a qualificação se adaptam automaticamente. Acesso: manager+.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { lerCaptacaoConfig } from "@/lib/politico/captacao-config";
import ConfigForm from "./_config-form";

export const dynamic = "force-dynamic";

export default async function PersonalizacaoCaptacaoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const config = await lerCaptacaoConfig(db, org.orgId);

  return (
    <div className="mx-auto max-w-[760px] px-4 py-7 space-y-5">
      <header>
        <Link href="/app/instagram/captacao" className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
          ← Captação
        </Link>
        <h1 className="font-heading text-[28px] font-bold leading-tight mt-2" style={{ color: "var(--color-text)" }}>
          Personalização da captação
        </h1>
        <p className="text-[15px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          Defina a região-alvo do candidato e as mensagens. O Kanban e a qualificação se adaptam sozinhos — o mesmo motor serve qualquer cidade.
        </p>
      </header>

      <ConfigForm inicial={config} />
    </div>
  );
}

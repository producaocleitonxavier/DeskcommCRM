import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { CommandHero } from "@/components/politico/command-hero";
import { WebhooksClient } from "./_components/WebhooksClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const canManage = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!canManage) redirect("/app/inbox");

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CommandHero
        eyebrow="Canais · Webhooks"
        titulo="Webhooks"
        subtitulo="Receba contatos de fora (landing pages, formulários) e crie automações que agem sozinhas."
      />
      <WebhooksClient />
    </div>
  );
}

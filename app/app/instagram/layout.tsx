/**
 * Layout da seção Instagram — gate de ADMINISTRADOR.
 *
 * Toda a "máquina" de captação do Instagram (conexão, automações, webhooks,
 * personalização, Kanban, performance) é o molho secreto da GIP: só admin
 * acessa. O time do cliente (manager/viewer) trabalha a base pela área de
 * Pessoas/Leads, não por aqui.
 */

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

export default async function InstagramLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.admin) redirect("/403");
  return <>{children}</>;
}

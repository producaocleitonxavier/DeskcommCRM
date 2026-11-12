import { redirect } from "next/navigation";

import { lerNutricao } from "@/app/actions/politico/nutricao-actions";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

import NutricaoClient from "./_client";

export const dynamic = "force-dynamic";

export default async function Page() {
  await exigirAcessoPolitico("nutricao");
  const estado = await lerNutricao();
  if (!estado) redirect("/app");
  return <NutricaoClient inicial={estado} />;
}

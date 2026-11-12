import FollowupSimplesClient from "./_client";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  await exigirAcessoPolitico("follow-up-simples");
  return <FollowupSimplesClient />;
}

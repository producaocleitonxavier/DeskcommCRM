import EnriquecerClient from "./_client";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  await exigirAcessoPolitico("enriquecer");
  return <EnriquecerClient />;
}

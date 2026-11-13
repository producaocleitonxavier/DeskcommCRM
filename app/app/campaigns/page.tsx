import type { Metadata } from "next";

import { ListaDeCampanhas } from "./_client";
import { exigirPortaDoPerfil } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campanhas" };

export default async function CampanhasPage() {
  await exigirPortaDoPerfil("/app/campaigns");
  // Auth e organização já vêm garantidas pelo layout de /app; a lista carrega
  // pela API, que confere o papel `manager` por conta própria.
  return <ListaDeCampanhas />;
}

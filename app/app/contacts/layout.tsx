/**
 * Trava de perfil: abaixo de gestor, esta área só abre para quem tem a porta
 * /app/contacts no perfil de menu. Cobre a tela e as telas filhas.
 * Ver `exigirPortaDoPerfil` em lib/politico/acesso.ts (varredura de 13/nov).
 */
import type { ReactNode } from "react";

import { exigirPortaDoPerfil } from "@/lib/politico/acesso";

export default async function TravaDePerfilLayout({ children }: { children: ReactNode }) {
  // A FICHA de uma pessoa (/app/contacts/123) é alcançada pela Agenda e por Locais,
  // que estão no perfil de rua: vale para quem tem a porta "Pessoas". A LISTA
  // inteira de Contatos tem trava própria na página.
  await exigirPortaDoPerfil("/app/contacts", { ouPorta: "/app/politico/leads" });
  return children;
}

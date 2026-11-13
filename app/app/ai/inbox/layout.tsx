/**
 * Trava de perfil: abaixo de gestor, esta área só abre para quem tem a porta
 * /app/ai/inbox no perfil de menu. Cobre a tela e as telas filhas.
 * Ver `exigirPortaDoPerfil` em lib/politico/acesso.ts (revisão independente de 13/nov).
 */
import type { ReactNode } from "react";

import { exigirPortaDoPerfil } from "@/lib/politico/acesso";

export default async function TravaDePerfilLayout({ children }: { children: ReactNode }) {
  await exigirPortaDoPerfil("/app/ai/inbox");
  return children;
}

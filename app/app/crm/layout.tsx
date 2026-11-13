/**
 * Trava de perfil: abaixo de gestor, esta área só abre para quem tem a porta
 * /app/crm no perfil de menu — e, por ser tela-índice, exige gestor. Cobre a tela e as telas filhas.
 * Ver `exigirPortaDoPerfil` em lib/politico/acesso.ts (varredura de 13/nov).
 */
import type { ReactNode } from "react";

import { exigirPortaDoPerfil } from "@/lib/politico/acesso";

export default async function TravaDePerfilLayout({ children }: { children: ReactNode }) {
  await exigirPortaDoPerfil("/app/crm", { indice: true });
  return children;
}

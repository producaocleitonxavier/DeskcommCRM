/**
 * Layout do módulo político (War Room 2.0) — envolve TODAS as rotas de
 * /app/politico/* no WarRoomShell, que ativa o tema dark tático ("Sala de
 * Guerra"). Um único ponto em vez de envolver cada page.tsx, com o mesmo efeito
 * e sem afetar o resto do DeskcommCRM.
 */

import WarRoomShell from "@/components/politico/war-room-shell";

export default function PoliticoLayout({ children }: { children: React.ReactNode }) {
  return <WarRoomShell>{children}</WarRoomShell>;
}

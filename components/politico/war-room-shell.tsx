/**
 * WarRoomShell — escopa o tema "Sala de Guerra" (dark tático) ao módulo político.
 *
 * O DeskcommCRM já tem um sistema de tema próprio (lib/theme + THEME_INIT_SCRIPT)
 * que é o DONO do `data-theme` no <html>. Setar `data-theme="dark"` no <html>
 * daqui era sobrescrito por esse provider (o "toggle" global), então o dark
 * tático não pegava.
 *
 * Solução: aplicar `data-theme="dark"` no PRÓPRIO wrapper. O globals.css define
 * os tokens em `[data-theme="dark"] { ... }` (não `:root`-restrito) e o
 * `@custom-variant dark` casa `[data-theme="dark"] *` — então as variáveis
 * (--color-bg, --color-surface, --color-text, --color-accent, …) e os utilitários
 * `dark:` cascateiam para tudo dentro do wrapper, sem tocar o <html> nem o resto
 * do app. Puramente SSR: sem useEffect, sem flash, sem conflito.
 */

export default function WarRoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="war-room" data-theme="dark">
      {children}
    </div>
  );
}

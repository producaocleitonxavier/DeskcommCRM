/**
 * WarRoomShell — escopa o tema "Sala de Guerra" (dark tático) ao módulo político.
 *
 * As CORES vêm dos overrides da classe `.war-room` no globals.css, que redefine
 * DIRETAMENTE os tokens que o Tailwind/shadcn lê (--background, --card, --border,
 * --muted-foreground, …) e os primitivos (--color-*) com valores dark fixos — à
 * prova do `@theme inline` e sem depender da cascata de `data-theme`.
 *
 * `data-theme="dark"` fica no PRÓPRIO wrapper (não no <html>, que pertence ao
 * theme provider do app) só para ativar os utilitários `dark:` das páginas
 * antigas; como é no div, não conflita com o provider nem afeta o resto do app.
 * Puramente SSR: sem useEffect, sem flash.
 */

export default function WarRoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="war-room" data-theme="dark">
      {children}
    </div>
  );
}

/**
 * WarRoomShell — wrapper que aplica o tema escuro War Room 2.0
 *
 * Funciona via classe CSS `.war-room` que sobrescreve TODAS as variáveis
 * de design token diretamente, sem depender de `data-theme` no `<html>`.
 *
 * Isso contorna a limitação do Tailwind 4 onde `@theme inline` registra
 * variáveis no `:root` e `[data-theme="dark"]` num `<div>` filho não
 * consegue vencer a cascade.
 */
export function WarRoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="war-room min-h-dvh">
      {children}
    </div>
  );
}

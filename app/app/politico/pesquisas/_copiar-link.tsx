"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Mostra o link público da pesquisa e copia a URL completa (origin + /pesquisa/token). */
export default function CopiarLink({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const url = `${window.location.origin}/pesquisa/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      // clipboard pode falhar (http/permite): seleciona num prompt como fallback
      window.prompt("Copie o link da pesquisa:", url);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="truncate rounded bg-secondary px-2 py-1 font-mono text-muted-foreground">
        /pesquisa/{token.slice(0, 8)}…
      </span>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
        style={{ background: "#D7F36A", color: "#1B2206" }}
      >
        {copiado ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copiado ? "Copiado!" : "Copiar link"}
      </button>
    </div>
  );
}

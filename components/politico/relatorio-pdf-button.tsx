"use client";

/**
 * Botão "Relatório PDF" do Gabinete: gera o relatório de demandas (server
 * action) e abre o PDF numa nova aba. Substitui o antigo export CSV.
 */

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { gerarRelatorioDemandas } from "@/app/actions/politico/gerarRelatorioDemandas";

export function RelatorioPdfButton({ filtroEstado }: { filtroEstado?: string }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={gerando}
        onClick={async () => {
          setErro(null);
          setGerando(true);
          const res = await gerarRelatorioDemandas(filtroEstado);
          setGerando(false);
          if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
          else setErro(res.erro);
        }}
        className="wr-btn inline-flex items-center gap-2 disabled:opacity-60"
      >
        {gerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
        {gerando ? "Gerando…" : "Relatório PDF"}
      </button>
      {erro && (
        <span className="absolute left-0 top-full mt-1 whitespace-nowrap text-xs" style={{ color: "#A3302A" }}>
          {erro}
        </span>
      )}
    </div>
  );
}

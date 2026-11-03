"use client";

/**
 * Botão "Excel" das Demandas: baixa a lista (respeitando os filtros atuais) em
 * CSV que abre no Excel. A montagem (org-scoped + filtros) é no servidor; aqui só
 * disparamos o download do texto recebido.
 */

import { useState } from "react";
import { Loader2, Sheet } from "lucide-react";

import { gerarCsvDemandas, type FiltrosCsvDemandas } from "@/app/actions/politico/gerarCsvDemandas";

export function ExcelDemandasButton({ filtros }: { filtros: FiltrosCsvDemandas }) {
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
          const res = await gerarCsvDemandas(filtros);
          setGerando(false);
          if (!res.ok) { setErro(res.erro); return; }
          try {
            const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = res.nome;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          } catch {
            setErro("Não foi possível baixar o arquivo.");
          }
        }}
        className="wr-btn inline-flex items-center gap-2 disabled:opacity-60"
      >
        {gerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sheet className="h-4 w-4" aria-hidden />}
        {gerando ? "Gerando…" : "Excel"}
      </button>
      {erro && (
        <span className="absolute left-0 top-full mt-1 whitespace-nowrap text-xs" style={{ color: "#A3302A" }}>{erro}</span>
      )}
    </div>
  );
}

export default ExcelDemandasButton;

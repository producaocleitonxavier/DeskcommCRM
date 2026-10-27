"use client";

/**
 * Botão de exportação CSV (abre no Excel), sem dependência externa. Gera o
 * arquivo no cliente a partir das linhas recebidas. Usa ";" como separador
 * (padrão pt-BR do Excel) e BOM UTF-8 para acentos.
 */

import { Download } from "lucide-react";

export interface ExportCsvProps {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  label?: string;
}

function celula(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ExportCsv({ filename, headers, rows, label = "Baixar planilha" }: ExportCsvProps) {
  function baixar() {
    if (typeof window === "undefined") return;
    const sep = ";";
    const linhas = [headers, ...rows].map((r) => r.map(celula).join(sep));
    const csv = "﻿" + linhas.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={baixar} className="wr-btn inline-flex items-center gap-1.5" disabled={rows.length === 0}>
      <Download className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}

export default ExportCsv;

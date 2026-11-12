"use client";

/**
 * Botão "Baixar relatório (PDF)" para telas de lista. Recebe cabeçalhos e linhas
 * como estão na tela e entrega ao motor de relatório do gabinete (timbre do
 * mandato, KPIs e tabela zebrada). Entrou no lugar do "Baixar planilha": o
 * gabinete quer um documento pronto para mostrar, não uma planilha crua.
 */

import { RelatorioGabineteButton } from "@/components/politico/relatorio-gabinete-button";
import type { RelatorioGabineteInputCliente } from "@/app/actions/politico/gerarRelatorioGabinete";

type Celula = string | number | null | undefined;

export interface RelatorioTabelaProps {
  slug: RelatorioGabineteInputCliente["slug"];
  titulo: string;
  headers: string[];
  rows: Celula[][];
  /** Peso relativo de cada coluna (padrão: 1ª coluna com peso 2, as demais 1). */
  pesos?: number[];
  resumo?: string;
  kpis?: { num: string; label: string }[];
  label?: string;
  /** Botão em destaque (verde). */
  destaque?: boolean;
}

export function RelatorioTabela({ slug, titulo, headers, rows, pesos, resumo, kpis, label = "Baixar relatório (PDF)", destaque }: RelatorioTabelaProps) {
  const p = headers.map((_, i) => pesos?.[i] ?? (i === 0 ? 2 : 1));
  const soma = p.reduce((a, b) => a + b, 0) || 1;
  const dados: RelatorioGabineteInputCliente = {
    slug,
    titulo,
    resumo: resumo ?? `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`,
    kpis: kpis ?? [{ num: String(rows.length), label: "Registros" }],
    colunas: headers.map((h, i) => ({ header: h, largura: `${(((p[i] ?? 1) * 100) / soma).toFixed(2)}%` })),
    linhas: rows.slice(0, 3000).map((r) =>
      headers.map((_, i) => {
        const v = r[i];
        const s = v == null || v === "" ? "—" : String(v);
        return s.length > 200 ? `${s.slice(0, 197)}…` : s;
      }),
    ),
  };
  return <RelatorioGabineteButton dados={dados} label={label} {...(destaque ? { destaque: true } : {})} />;
}

export default RelatorioTabela;

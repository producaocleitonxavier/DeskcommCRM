// lib/politico/relatorio-gabinete-pdf.tsx
/**
 * Relatório genérico do Gabinete em PDF (War Room 2.0) — prestação de contas
 * para Lideranças, Emendas e Projetos de Lei. Usa o KIT visual compartilhado
 * (`relatorio-kit`) — "Executivo Premium": logo à esquerda, KPIs, barras de
 * distribuição, caixa de LEITURA (análise) e tabela zebrada. O renderer não sabe
 * nada do domínio: recebe tudo já formatado (incluindo a análise e as barras).
 */
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import {
  Analise,
  type BarraItem,
  Cabecalho,
  type ColunaKit,
  Distribuicoes,
  FaixaTopo,
  Kpis,
  Rodape,
  Tabela,
  TituloRelatorio,
  dataHoraPdf,
  estilos,
} from "@/lib/politico/relatorio-kit";

export type RelatorioColuna = ColunaKit;

export interface RelatorioGabineteInput {
  nome: string | null;
  subtitulo: string | null;
  logoUrl: string | null;
  accentHex: string | null;
  geradoEm: string; // ISO
  titulo: string; // "Relatório de Lideranças"
  resumo: string | null; // linha curta sob o título (filtro, total…)
  kpis: { num: string; label: string }[];
  colunas: RelatorioColuna[];
  linhas: string[][];
  /** Leitura analítica do período (opcional) — a caixa de destaque. */
  analise?: string[];
  /** Barras de distribuição (opcional), ex.: valor por área. */
  distribuicoes?: { titulo: string; itens: BarraItem[] };
  /** Mapa valor→cor para colunas marcadas como pílula (ex.: status). */
  coresPilula?: Record<string, string>;
}

function Doc({ d }: { d: RelatorioGabineteInput }): React.ReactElement {
  const accent = d.accentHex ?? "#161616";
  const nome = (d.nome ?? "Gabinete").trim();
  const subtitulo = (d.subtitulo ?? "Gabinete — Atendimento ao cidadão").trim();
  const meta = `Gerado em ${dataHoraPdf(d.geradoEm)}${d.resumo ? `  ·  ${d.resumo}` : ""}`;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={estilos.page}>
        <FaixaTopo accent={accent} />
        <View style={estilos.corpo}>
          <Cabecalho nome={nome} subtitulo={subtitulo} logoUrl={d.logoUrl} />
          <TituloRelatorio titulo={d.titulo} meta={meta} />
          <Kpis itens={d.kpis} accent={accent} />
          {d.distribuicoes ? <Distribuicoes titulo={d.distribuicoes.titulo} itens={d.distribuicoes.itens} /> : null}
          {d.analise && d.analise.length > 0 ? <Analise pontos={d.analise} accent={accent} /> : null}
          <Text style={estilos.secTitulo}>Registros ({d.linhas.length})</Text>
          <Tabela colunas={d.colunas} linhas={d.linhas} accent={accent} coresPilula={d.coresPilula} />
        </View>
        <Rodape nome={nome} titulo={d.titulo} />
      </Page>
    </Document>
  );
}

export async function renderRelatorioGabinetePdf(input: RelatorioGabineteInput): Promise<Buffer> {
  const buf = await renderToBuffer(<Doc d={input} />);
  return buf as Buffer;
}

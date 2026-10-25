// lib/politico/relatorio-pdf.tsx
/**
 * Relatório de Demandas do Gabinete em PDF (War Room 2.0). Prestação de contas:
 * timbre (logo à esquerda), KPIs, barras de distribuição por status, LEITURA do
 * período (análise) e a tabela de demandas. Usa o KIT visual compartilhado
 * (`relatorio-kit`) — mesmo "Executivo Premium" dos demais relatórios.
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

const COLUNAS: ColunaKit[] = [
  { header: "Justificativa", largura: "30%" },
  { header: "Tipo", largura: "12%" },
  { header: "Órgão", largura: "16%" },
  { header: "Status", largura: "11%", pilula: true },
  { header: "Prioridade", largura: "10%" },
  { header: "Visita", largura: "10.5%" },
  { header: "Aberta em", largura: "10.5%" },
];

export interface RelatorioLinha {
  assunto: string;
  tipo: string;
  orgao: string;
  status: string;
  prioridade: string;
  prazo: string;
  aberta: string;
}

export interface RelatorioPdfInput {
  nome: string | null;
  subtitulo: string | null;
  logoUrl: string | null;
  accentHex: string | null;
  geradoEm: string; // ISO
  filtroLabel: string | null;
  kpis: { total: number; abertas: number; resolvidasMes: number; tempoMedioDias: number | null };
  statusDist: { label: string; count: number; cor: string }[];
  linhas: RelatorioLinha[];
  /** Leitura analítica do período (opcional). */
  analise?: string[];
}

function Doc({ d }: { d: RelatorioPdfInput }): React.ReactElement {
  const accent = d.accentHex ?? "#161616";
  const nome = (d.nome ?? "Gabinete").trim();
  const subtitulo = (d.subtitulo ?? "Gabinete — Atendimento ao cidadão").trim();
  const meta = `Gerado em ${dataHoraPdf(d.geradoEm)}${d.filtroLabel ? `  ·  Filtro: ${d.filtroLabel}` : ""}`;

  const totalDist = d.statusDist.reduce((s, x) => s + x.count, 0);
  const barras: BarraItem[] = d.statusDist.map((s) => ({
    label: s.label,
    valor: `${s.count}${totalDist > 0 ? ` · ${Math.round((s.count / totalDist) * 100)}%` : ""}`,
    pct: totalDist > 0 ? (s.count / totalDist) * 100 : 0,
    cor: s.cor,
  }));
  const coresPilula: Record<string, string> = Object.fromEntries(d.statusDist.map((s) => [s.label, s.cor]));

  const kpis = [
    { num: String(d.kpis.total), label: "Total de demandas" },
    { num: String(d.kpis.abertas), label: "Abertas" },
    { num: String(d.kpis.resolvidasMes), label: "Resolvidas este mês" },
    { num: d.kpis.tempoMedioDias !== null ? String(d.kpis.tempoMedioDias) : "—", label: "Tempo médio (dias)" },
  ];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={estilos.page}>
        <FaixaTopo accent={accent} />
        <View style={estilos.corpo}>
          <Cabecalho nome={nome} subtitulo={subtitulo} logoUrl={d.logoUrl} />
          <TituloRelatorio titulo="Relatório de Demandas" meta={meta} />
          <Kpis itens={kpis} accent={accent} />
          {barras.length > 0 ? <Distribuicoes titulo="Distribuição por status" itens={barras} /> : null}
          {d.analise && d.analise.length > 0 ? <Analise pontos={d.analise} accent={accent} /> : null}
          <Text style={estilos.secTitulo}>Demandas ({d.linhas.length})</Text>
          <Tabela
            colunas={COLUNAS}
            linhas={d.linhas.map((l) => [l.assunto, l.tipo, l.orgao, l.status, l.prioridade, l.prazo, l.aberta])}
            accent={accent}
            coresPilula={coresPilula}
          />
        </View>
        <Rodape nome={nome} titulo="Relatório de Demandas" />
      </Page>
    </Document>
  );
}

export async function renderRelatorioDemandasPdf(input: RelatorioPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<Doc d={input} />);
  return buf as Buffer;
}

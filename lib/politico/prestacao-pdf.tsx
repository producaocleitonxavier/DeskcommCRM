// lib/politico/prestacao-pdf.tsx
/**
 * Relatório de PRESTAÇÃO DE CONTAS do mandato em PDF — o trabalho do mandato em
 * números, para o cidadão (transparência) e para o dossiê do mandato. Usa o KIT
 * visual compartilhado ("Executivo Premium"), com o timbre da organização.
 */
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import {
  Analise,
  type BarraItem,
  Cabecalho,
  Distribuicoes,
  FaixaTopo,
  Kpis,
  Rodape,
  TituloRelatorio,
  dataHoraPdf,
  estilos,
} from "@/lib/politico/relatorio-kit";
import type { PrestacaoContas } from "@/lib/politico/prestacao-contas-dados";

/** "1 demanda" / "4 demandas" — sem o "(s)" de formulário. */
function pl(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export interface PrestacaoPdfInput {
  nome: string | null;
  subtitulo: string | null;
  logoUrl: string | null;
  accentHex: string | null;
  geradoEm: string;
  periodoLabel: string;
  dados: PrestacaoContas;
}

function reais(v: number): string {
  if (v >= 1_000_000) return "R$ " + (v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if (v >= 1_000) return "R$ " + (v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  return "R$ " + v.toLocaleString("pt-BR");
}

function Doc({ d }: { d: PrestacaoPdfInput }): React.ReactElement {
  const accent = d.accentHex ?? "#161616";
  const nome = (d.nome ?? "Gabinete").trim();
  const subtitulo = (d.subtitulo ?? "Gabinete — Atendimento ao cidadão").trim();
  const meta = `Período: ${d.periodoLabel}  ·  Gerado em ${dataHoraPdf(d.geradoEm)}`;
  const x = d.dados;

  const linha1 = [
    { num: String(x.demandasAtendidas), label: "Demandas atendidas" },
    { num: x.tempoMedioDias != null ? String(x.tempoMedioDias).replace(".", ",") : "—", label: "Tempo médio (dias)" },
    { num: String(x.oficios), label: "Ofícios emitidos" },
    { num: String(x.avisos), label: "Avisos ao cidadão" },
  ];
  const linha2 = [
    { num: String(x.obrasEntregues), label: "Obras entregues" },
    { num: String(x.obrasAndamento), label: "Obras em andamento" },
    { num: x.emendasQtd > 0 ? reais(x.emendasValor) : "—", label: "Emendas destinadas" },
    { num: x.baseTotal.toLocaleString("pt-BR"), label: "Pessoas na base" },
  ];

  const maxEvol = Math.max(1, ...x.evolucao.map((e) => e.valor));
  const barrasEvol: BarraItem[] = x.evolucao.map((e) => ({
    label: e.mes,
    valor: String(e.valor),
    pct: (e.valor / maxEvol) * 100,
    cor: accent,
  }));
  const maxBairro = Math.max(1, ...x.topBairros.map((b) => b.valor));
  const barrasBairro: BarraItem[] = x.topBairros.map((b) => ({
    label: b.bairro,
    valor: String(b.valor),
    pct: (b.valor / maxBairro) * 100,
    cor: accent,
  }));

  const analise: string[] = [];
  if (x.demandasAtendidas > 0) {
    const ritmo = x.tempoMedioDias == null ? "" : x.tempoMedioDias <= 3 ? ", em um ritmo ágil" : x.tempoMedioDias <= 10 ? ", dentro de um prazo saudável" : ", com prazo a melhorar";
    analise.push(`${pl(x.demandasAtendidas, "demanda do cidadão atendida", "demandas do cidadão atendidas")} pelo gabinete${ritmo}.`);
  }
  if (x.oficios > 0) analise.push(`${pl(x.oficios, "ofício emitido", "ofícios emitidos")} aos órgãos responsáveis.`);
  if (x.obrasEntregues > 0 || x.obrasAndamento > 0) analise.push(`Obras: ${pl(x.obrasEntregues, "entregue", "entregues")} e ${x.obrasAndamento} em andamento.`);
  if (x.emendasQtd > 0) analise.push(`${reais(x.emendasValor)} em emendas destinadas (${pl(x.emendasQtd, "emenda", "emendas")}).`);
  if (x.topBairros.length > 0) analise.push(`Trabalho presente em ${pl(x.topBairros.length, "bairro", "bairros")}${(x.topBairros[0]?.valor ?? 0) > (x.topBairros[1]?.valor ?? 0) ? `, com destaque para ${x.topBairros[0]?.bairro}` : ""}.`);
  if (x.baseNovos > 0) analise.push(`${pl(x.baseNovos, "nova pessoa", "novas pessoas")} no relacionamento do gabinete no período.`);

  return (
    <Document>
      <Page size="A4" style={estilos.page}>
        <FaixaTopo accent={accent} />
        <View style={estilos.corpo}>
          <Cabecalho nome={nome} subtitulo={subtitulo} logoUrl={d.logoUrl} />
          <TituloRelatorio titulo="Prestação de Contas do Mandato" meta={meta} />
          <Kpis itens={linha1} accent={accent} />
          <Kpis itens={linha2} accent={accent} />
          {barrasEvol.some((b) => b.pct > 0) ? <Distribuicoes titulo="Demandas resolvidas por mês (últimos 6 meses)" itens={barrasEvol} /> : null}
          {barrasBairro.length > 0 ? <Distribuicoes titulo="Bairros mais atendidos" itens={barrasBairro} /> : null}
          {analise.length > 0 ? <Analise pontos={analise} accent={accent} titulo="Resumo do mandato" /> : null}
        </View>
        <Rodape nome={nome} titulo="Prestação de Contas" />
      </Page>
    </Document>
  );
}

export async function renderRelatorioPrestacaoContasPdf(input: PrestacaoPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<Doc d={input} />);
  return buf as Buffer;
}

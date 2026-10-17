// lib/politico/relatorio-pdf.tsx
/**
 * Relatório de Demandas do Gabinete em PDF (War Room 2.0). Documento de
 * prestação de contas: timbre da organização (nome/logo do parlamentar), data
 * de geração, KPIs, distribuição por status e a tabela de demandas. Mesmo motor
 * das propostas/ofício (@react-pdf/renderer).
 */
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 32, fontSize: 9, color: "#1A1A1A" },
  cabecalho: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, paddingBottom: 10, marginBottom: 14 },
  marcaNome: { fontSize: 14, fontWeight: 700 },
  marcaSub: { fontSize: 8, color: "#555", marginTop: 2 },
  logo: { width: 110, height: 42, objectFit: "contain" },
  titulo: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  sub: { fontSize: 8, color: "#666", marginBottom: 12 },
  kpis: { flexDirection: "row", gap: 10, marginBottom: 14 },
  kpi: { flex: 1, borderWidth: 0.5, borderColor: "#DDD", borderRadius: 6, padding: 8 },
  kpiNum: { fontSize: 16, fontWeight: 700 },
  kpiLabel: { fontSize: 7.5, color: "#666", marginTop: 2 },
  secTitulo: { fontSize: 10, fontWeight: 700, marginTop: 4, marginBottom: 6 },
  distRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  distItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  distDot: { width: 7, height: 7, borderRadius: 4 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 4, marginBottom: 2 },
  th: { fontSize: 8, fontWeight: 700, color: "#333" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E5E5E5", paddingVertical: 4 },
  td: { fontSize: 8, color: "#1A1A1A", paddingRight: 4 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 7, color: "#999", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#DDD", paddingTop: 5 },
});

// Larguras das colunas (fração do conteúdo).
const COLS = { assunto: "30%", tipo: "12%", orgao: "16%", status: "11%", prioridade: "10%", prazo: "10.5%", aberta: "10.5%" } as const;

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
  filtroLabel: string | null; // "Todas", "Resolvidas", etc.
  kpis: { total: number; abertas: number; resolvidasMes: number; tempoMedioDias: number | null };
  statusDist: { label: string; count: number; cor: string }[];
  linhas: RelatorioLinha[];
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Doc({ d }: { d: RelatorioPdfInput }): React.ReactElement {
  const accent = d.accentHex ?? "#1A1A1A";
  const nome = (d.nome ?? "Gabinete").trim();
  const subtitulo = (d.subtitulo ?? "Gabinete — Atendimento ao cidadão").trim();
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={[styles.cabecalho, { borderBottomColor: accent }]}>
          <View>
            <Text style={[styles.marcaNome, { color: accent }]}>{nome}</Text>
            {subtitulo ? <Text style={styles.marcaSub}>{subtitulo}</Text> : null}
          </View>
          {d.logoUrl ? <Image src={d.logoUrl} style={styles.logo} /> : null}
        </View>

        <Text style={styles.titulo}>Relatório de Demandas</Text>
        <Text style={styles.sub}>
          Gerado em {dataHora(d.geradoEm)}
          {d.filtroLabel ? `  ·  Filtro: ${d.filtroLabel}` : ""}
        </Text>

        <View style={styles.kpis}>
          <View style={styles.kpi}>
            <Text style={styles.kpiNum}>{d.kpis.total}</Text>
            <Text style={styles.kpiLabel}>Total de demandas</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiNum}>{d.kpis.abertas}</Text>
            <Text style={styles.kpiLabel}>Abertas</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiNum}>{d.kpis.resolvidasMes}</Text>
            <Text style={styles.kpiLabel}>Resolvidas este mês</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiNum}>{d.kpis.tempoMedioDias !== null ? `${d.kpis.tempoMedioDias}` : "—"}</Text>
            <Text style={styles.kpiLabel}>Tempo médio (dias)</Text>
          </View>
        </View>

        {d.statusDist.length > 0 && (
          <>
            <Text style={styles.secTitulo}>Distribuição por status</Text>
            <View style={styles.distRow}>
              {d.statusDist.map((s) => (
                <View key={s.label} style={styles.distItem}>
                  <View style={[styles.distDot, { backgroundColor: s.cor }]} />
                  <Text style={{ fontSize: 8 }}>
                    {s.label}: {s.count}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.secTitulo}>Demandas ({d.linhas.length})</Text>
        <View style={styles.thead} fixed>
          <Text style={[styles.th, { width: COLS.assunto }]}>Assunto</Text>
          <Text style={[styles.th, { width: COLS.tipo }]}>Tipo</Text>
          <Text style={[styles.th, { width: COLS.orgao }]}>Órgão</Text>
          <Text style={[styles.th, { width: COLS.status }]}>Status</Text>
          <Text style={[styles.th, { width: COLS.prioridade }]}>Prioridade</Text>
          <Text style={[styles.th, { width: COLS.prazo }]}>Prazo</Text>
          <Text style={[styles.th, { width: COLS.aberta }]}>Aberta em</Text>
        </View>
        {d.linhas.map((l, i) => (
          <View key={i} style={styles.tr} wrap={false}>
            <Text style={[styles.td, { width: COLS.assunto }]}>{l.assunto}</Text>
            <Text style={[styles.td, { width: COLS.tipo }]}>{l.tipo}</Text>
            <Text style={[styles.td, { width: COLS.orgao }]}>{l.orgao}</Text>
            <Text style={[styles.td, { width: COLS.status }]}>{l.status}</Text>
            <Text style={[styles.td, { width: COLS.prioridade }]}>{l.prioridade}</Text>
            <Text style={[styles.td, { width: COLS.prazo }]}>{l.prazo}</Text>
            <Text style={[styles.td, { width: COLS.aberta }]}>{l.aberta}</Text>
          </View>
        ))}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${nome} — Relatório de Demandas — página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function renderRelatorioDemandasPdf(input: RelatorioPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<Doc d={input} />);
  return buf as Buffer;
}

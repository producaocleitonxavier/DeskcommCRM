// lib/politico/relatorio-gabinete-pdf.tsx
/**
 * Relatório genérico do Gabinete em PDF (War Room 2.0) — prestação de contas
 * para Lideranças, Emendas e Projetos de Lei. Mesmo timbre do ofício/relatório
 * de demandas (nome/logo do parlamentar, data de geração), KPIs e uma tabela
 * com colunas configuráveis. Motor único (@react-pdf/renderer).
 *
 * A tabela recebe colunas com largura em % e as linhas já formatadas pelo
 * chamador — o renderer não sabe nada do domínio, só desenha.
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
  kpiNum: { fontSize: 15, fontWeight: 700 },
  kpiLabel: { fontSize: 7.5, color: "#666", marginTop: 2 },
  secTitulo: { fontSize: 10, fontWeight: 700, marginTop: 4, marginBottom: 6 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 4, marginBottom: 2 },
  th: { fontSize: 8, fontWeight: 700, color: "#333", paddingRight: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E5E5E5", paddingVertical: 4 },
  td: { fontSize: 8, color: "#1A1A1A", paddingRight: 4 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 7, color: "#999", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#DDD", paddingTop: 5 },
});

export interface RelatorioColuna {
  header: string;
  /** Largura da coluna como fração do conteúdo, ex.: "20%". */
  largura: string;
}

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
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Doc({ d }: { d: RelatorioGabineteInput }): React.ReactElement {
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

        <Text style={styles.titulo}>{d.titulo}</Text>
        <Text style={styles.sub}>
          Gerado em {dataHora(d.geradoEm)}
          {d.resumo ? `  ·  ${d.resumo}` : ""}
        </Text>

        {d.kpis.length > 0 && (
          <View style={styles.kpis}>
            {d.kpis.map((k) => (
              <View key={k.label} style={styles.kpi}>
                <Text style={styles.kpiNum}>{k.num}</Text>
                <Text style={styles.kpiLabel}>{k.label}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.secTitulo}>Registros ({d.linhas.length})</Text>
        <View style={styles.thead} fixed>
          {d.colunas.map((c, i) => (
            <Text key={i} style={[styles.th, { width: c.largura }]}>
              {c.header}
            </Text>
          ))}
        </View>
        {d.linhas.map((linha, i) => (
          <View key={i} style={styles.tr} wrap={false}>
            {d.colunas.map((c, j) => (
              <Text key={j} style={[styles.td, { width: c.largura }]}>
                {linha[j] ?? ""}
              </Text>
            ))}
          </View>
        ))}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${nome} — ${d.titulo} — página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function renderRelatorioGabinetePdf(input: RelatorioGabineteInput): Promise<Buffer> {
  const buf = await renderToBuffer(<Doc d={input} />);
  return buf as Buffer;
}

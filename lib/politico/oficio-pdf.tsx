// lib/politico/oficio-pdf.tsx
/**
 * Ofício do Gabinete em PDF (War Room 2.0). Documento formal para protocolar
 * no órgão: timbre com a marca da ORGANIZAÇÃO (nome/logo do parlamentar — nunca
 * a marca da instalação, mesma régua do PDF de LGPD e das propostas), número do
 * ofício, data por extenso, destinatário (órgão) e o corpo = texto do
 * encaminhamento (gerado pela IA ou escrito à mão). Renderiza com
 * @react-pdf/renderer, o mesmo motor das propostas.
 */
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 64, paddingHorizontal: 56, fontSize: 11, lineHeight: 1.5, color: "#1A1A1A" },
  cabecalho: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, paddingBottom: 12, marginBottom: 24 },
  marcaNome: { fontSize: 15, fontWeight: 700 },
  marcaSub: { fontSize: 9, color: "#555", marginTop: 2 },
  logo: { width: 120, height: 48, objectFit: "contain" },
  linhaTopo: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  numero: { fontSize: 11, fontWeight: 700 },
  data: { fontSize: 11 },
  destinatario: { marginBottom: 20, fontSize: 11, fontWeight: 700 },
  corpo: { fontSize: 11, lineHeight: 1.6, textAlign: "justify" },
  assinaturaBloco: { marginTop: 56, alignItems: "center" },
  assinaturaLinha: { width: 220, borderTopWidth: 1, borderTopColor: "#1A1A1A", marginBottom: 4 },
  assinaturaNome: { fontSize: 11, fontWeight: 700 },
  assinaturaCargo: { fontSize: 9, color: "#555" },
  footer: { position: "absolute", bottom: 28, left: 56, right: 56, fontSize: 8, color: "#888", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#CCC", paddingTop: 6 },
});

export interface OficioPdfInput {
  numero: number;
  ano: number;
  /** Texto do encaminhamento — o corpo do ofício. */
  corpo: string;
  /** Órgão de destino (ex.: "Secretaria de Obras"); null vira genérico. */
  orgao: string | null;
  /** Cidade de emissão para o cabeçalho de data; null omite a cidade. */
  cidade: string | null;
  /** Data de emissão (ISO). */
  dataISO: string;
  marca: { appName: string | null; accentHex: string | null; logoUrl: string | null };
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dataPorExtenso(iso: string, cidade: string | null): string {
  const d = new Date(iso);
  const texto = `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  return cidade ? `${cidade}, ${texto}.` : `${texto}.`;
}

function OficioDoc({ d }: { d: OficioPdfInput }): React.ReactElement {
  const accent = d.marca.accentHex ?? "#1A1A1A";
  const nome = d.marca.appName ?? "Gabinete";
  const destino = d.orgao?.trim() ? `Ao(À) ${d.orgao.trim()}` : "Ao órgão competente";
  const numeroFmt = `OFÍCIO Nº ${String(d.numero).padStart(3, "0")}/${d.ano}`;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.cabecalho, { borderBottomColor: accent }]}>
          <View>
            <Text style={[styles.marcaNome, { color: accent }]}>{nome}</Text>
            <Text style={styles.marcaSub}>Gabinete — Atendimento ao cidadão</Text>
          </View>
          {d.marca.logoUrl ? <Image src={d.marca.logoUrl} style={styles.logo} /> : null}
        </View>

        <View style={styles.linhaTopo}>
          <Text style={styles.numero}>{numeroFmt}</Text>
          <Text style={styles.data}>{dataPorExtenso(d.dataISO, d.cidade)}</Text>
        </View>

        <Text style={styles.destinatario}>{destino}</Text>

        <Text style={styles.corpo}>{d.corpo}</Text>

        <View style={styles.assinaturaBloco}>
          <View style={styles.assinaturaLinha} />
          <Text style={styles.assinaturaNome}>{nome}</Text>
          <Text style={styles.assinaturaCargo}>Gabinete Parlamentar</Text>
        </View>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${numeroFmt} — página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function renderOficioPdf(input: OficioPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<OficioDoc d={input} />);
  return buf as Buffer;
}

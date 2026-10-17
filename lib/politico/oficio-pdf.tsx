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
  assinaturaBloco: { marginTop: 48, alignItems: "center" },
  assinaturaImagem: { height: 56, width: 180, objectFit: "contain", marginBottom: 2 },
  assinaturaLinha: { width: 220, borderTopWidth: 1, borderTopColor: "#1A1A1A", marginBottom: 4 },
  assinaturaNome: { fontSize: 11, fontWeight: 700 },
  assinaturaCargo: { fontSize: 9, color: "#555" },
  footer: { position: "absolute", bottom: 28, left: 56, right: 56, fontSize: 8, color: "#888", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#CCC", paddingTop: 6 },
  // Timbrado: página sem padding (a imagem é o fundo) + faixa de conteúdo que
  // limpa o cabeçalho (~120pt) e o rodapé (~150pt) típicos do papel timbrado.
  pageTimbrado: { position: "relative", fontSize: 11, lineHeight: 1.5, color: "#1A1A1A" },
  fundoTimbrado: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  conteudoTimbrado: { paddingTop: 120, paddingBottom: 150, paddingHorizontal: 70 },
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
  /** Nome do parlamentar (cabeçalho + assinatura). Cai para a marca da org. */
  nome: string | null;
  /** Linha de apoio no cabeçalho (ex.: "Trabalhando por Minas Gerais"). */
  subtitulo: string | null;
  /** Cargo na assinatura (ex.: "Deputado Estadual"). */
  cargo: string | null;
  /** URL da imagem da assinatura (acima do nome); null omite. */
  assinaturaUrl: string | null;
  /**
   * Imagem A4 do papel timbrado (fundo de página inteira). Quando presente, o
   * cabeçalho/rodapé gerados são omitidos e o texto é sobreposto na faixa do
   * corpo (margens generosas que limpam o cabeçalho e o rodapé do timbrado).
   */
  timbradoUrl: string | null;
  /**
   * Margens (em PONTOS) do texto sobre o timbrado, por cliente — cada timbrado
   * tem diagramação própria. Ausentes = padrão (topo 120, base 150, lados 70).
   */
  timbradoMargens?: { topo?: number | null; base?: number | null; lados?: number | null } | null;
  marca: { appName: string | null; accentHex: string | null; logoUrl: string | null };
}

/** Padrão das margens do texto no timbrado, em pontos. */
export const TIMBRADO_MARGENS_PADRAO = { topo: 120, base: 150, lados: 70 } as const;

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dataPorExtenso(iso: string, cidade: string | null): string {
  const d = new Date(iso);
  const texto = `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  return cidade ? `${cidade}, ${texto}.` : `${texto}.`;
}

/** Corpo do ofício (sem cabeçalho/rodapé) — compartilhado pelos dois layouts. */
function Corpo({ d, nome, cargo }: { d: OficioPdfInput; nome: string; cargo: string }): React.ReactElement {
  const destino = d.orgao?.trim() ? `Ao(À) ${d.orgao.trim()}` : "Ao órgão competente";
  const numeroFmt = `OFÍCIO Nº ${String(d.numero).padStart(3, "0")}/${d.ano}`;
  return (
    <>
      <View style={styles.linhaTopo}>
        <Text style={styles.numero}>{numeroFmt}</Text>
        <Text style={styles.data}>{dataPorExtenso(d.dataISO, d.cidade)}</Text>
      </View>
      <Text style={styles.destinatario}>{destino}</Text>
      <Text style={styles.corpo}>{d.corpo}</Text>
      <View style={styles.assinaturaBloco}>
        {d.assinaturaUrl ? <Image src={d.assinaturaUrl} style={styles.assinaturaImagem} /> : null}
        <View style={styles.assinaturaLinha} />
        <Text style={styles.assinaturaNome}>{nome}</Text>
        <Text style={styles.assinaturaCargo}>{cargo}</Text>
      </View>
    </>
  );
}

function OficioDoc({ d }: { d: OficioPdfInput }): React.ReactElement {
  const accent = d.marca.accentHex ?? "#1A1A1A";
  const nome = (d.nome ?? d.marca.appName ?? "Gabinete").trim();
  const subtitulo = (d.subtitulo ?? "Gabinete — Atendimento ao cidadão").trim();
  const cargo = (d.cargo ?? "Gabinete Parlamentar").trim();
  const logoUrl = d.marca.logoUrl;
  const numeroFmt = `OFÍCIO Nº ${String(d.numero).padStart(3, "0")}/${d.ano}`;

  // Com papel timbrado: a imagem é o fundo da página inteira (cabeçalho e rodapé
  // já vêm nela), e o texto entra só na faixa do corpo.
  if (d.timbradoUrl) {
    const m = d.timbradoMargens ?? {};
    const margens = {
      paddingTop: m.topo ?? TIMBRADO_MARGENS_PADRAO.topo,
      paddingBottom: m.base ?? TIMBRADO_MARGENS_PADRAO.base,
      paddingHorizontal: m.lados ?? TIMBRADO_MARGENS_PADRAO.lados,
    };
    return (
      <Document>
        <Page size="A4" style={styles.pageTimbrado}>
          <Image src={d.timbradoUrl} style={styles.fundoTimbrado} fixed />
          <View style={margens}>
            <Corpo d={d} nome={nome} cargo={cargo} />
          </View>
        </Page>
      </Document>
    );
  }

  // Sem timbrado: cabeçalho gerado (marca da org) + rodapé de paginação.
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.cabecalho, { borderBottomColor: accent }]}>
          <View>
            <Text style={[styles.marcaNome, { color: accent }]}>{nome}</Text>
            {subtitulo ? <Text style={styles.marcaSub}>{subtitulo}</Text> : null}
          </View>
          {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
        </View>

        <Corpo d={d} nome={nome} cargo={cargo} />

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

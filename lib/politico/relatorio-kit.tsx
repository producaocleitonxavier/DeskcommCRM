// lib/politico/relatorio-kit.tsx
/**
 * KIT VISUAL dos relatórios do Gabinete em PDF (@react-pdf/renderer) — o
 * "Executivo Premium": fundo branco, econômico pra impressão, com a cor da marca
 * (accent) nos detalhes (faixa do topo, topo dos KPIs, barras, espinha da caixa
 * de análise, régua da tabela). Um só kit para Demandas, Lideranças, Emendas e
 * Projetos — assim o timbre não diverge de um relatório pro outro.
 *
 * Decisão de contraste: o TEXTO é sempre escuro (nunca na cor da marca), porque
 * o accent de um cliente pode ser claro (ex.: lima) e nome em lima sobre branco
 * fica ilegível. O accent entra só em ELEMENTOS (faixas, barras, bordas), onde
 * clareza não vira problema de leitura.
 */
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import React from "react";

export const TINTA = {
  forte: "#161616",
  texto: "#2A2A2A",
  medio: "#5A5A5A",
  fraco: "#8A8A8A",
  linha: "#E6E6E6",
  zebra: "#FafafA",
  trilho: "#EFEFEF",
  caixa: "#F7F7F5",
} as const;

export const estilos = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 46, paddingHorizontal: 0, fontSize: 9, color: TINTA.texto, fontFamily: "Helvetica" },
  // Faixa fina na cor da marca no topo absoluto da página.
  faixaTopo: { height: 5 },
  corpo: { paddingHorizontal: 34 },

  cabecalho: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 22, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: TINTA.linha, marginBottom: 14 },
  cabecalhoEsq: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 46, height: 46, objectFit: "contain" },
  marcaNome: { fontSize: 15, fontWeight: 700, color: TINTA.forte, letterSpacing: 0.2 },
  marcaSub: { fontSize: 8, color: TINTA.medio, marginTop: 2 },
  selo: { fontSize: 7, color: TINTA.fraco, textTransform: "uppercase", letterSpacing: 1 },

  titulo: { fontSize: 15, fontWeight: 700, color: TINTA.forte, marginBottom: 2 },
  meta: { fontSize: 8, color: TINTA.medio, marginBottom: 14 },

  kpis: { flexDirection: "row", gap: 9, marginBottom: 16 },
  kpi: { flex: 1, borderWidth: 0.5, borderColor: TINTA.linha, borderTopWidth: 2, borderRadius: 5, paddingVertical: 9, paddingHorizontal: 10 },
  kpiNum: { fontSize: 17, fontWeight: 700, color: TINTA.forte },
  kpiLabel: { fontSize: 7.5, color: TINTA.medio, marginTop: 3 },

  secTitulo: { fontSize: 9.5, fontWeight: 700, color: TINTA.forte, marginTop: 2, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 },

  barraLinha: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 },
  barraRotulo: { width: 120, fontSize: 8, color: TINTA.texto },
  barraTrilho: { flex: 1, height: 9, backgroundColor: TINTA.trilho, borderRadius: 5 },
  barraPreenche: { height: 9, borderRadius: 5 },
  barraValor: { width: 70, fontSize: 8, color: TINTA.medio, textAlign: "right" },

  analise: { backgroundColor: TINTA.caixa, borderLeftWidth: 3, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 16 },
  analiseTitulo: { fontSize: 9, fontWeight: 700, color: TINTA.forte, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.6 },
  analiseItem: { flexDirection: "row", gap: 5, marginBottom: 3 },
  analiseBolinha: { fontSize: 8.5, color: TINTA.medio },
  analiseTexto: { fontSize: 8.5, color: TINTA.texto, lineHeight: 1.4, flex: 1 },

  thead: { flexDirection: "row", borderBottomWidth: 1.2, paddingBottom: 5, marginBottom: 1 },
  th: { fontSize: 8, fontWeight: 700, color: TINTA.forte, paddingRight: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: TINTA.linha, paddingVertical: 4.5, paddingHorizontal: 3 },
  td: { fontSize: 8, color: TINTA.texto, paddingRight: 4 },
  pilula: { alignSelf: "flex-start", borderRadius: 8, paddingVertical: 1.5, paddingHorizontal: 6, fontSize: 7.5, fontWeight: 700 },

  footer: { position: "absolute", bottom: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 0.5, borderTopColor: TINTA.linha, paddingTop: 5 },
  footerTxt: { fontSize: 6.5, color: TINTA.fraco },
});

// ── Componentes ────────────────────────────────────────────────────────────

export function FaixaTopo({ accent }: { accent: string }): React.ReactElement {
  return <View style={[estilos.faixaTopo, { backgroundColor: accent }]} fixed />;
}

export function Cabecalho({
  nome,
  subtitulo,
  logoUrl,
}: {
  nome: string;
  subtitulo: string | null;
  logoUrl: string | null;
}): React.ReactElement {
  return (
    <View style={estilos.cabecalho}>
      <View style={estilos.cabecalhoEsq}>
        {logoUrl ? <Image src={logoUrl} style={estilos.logo} /> : null}
        <View>
          <Text style={estilos.marcaNome}>{nome}</Text>
          {subtitulo ? <Text style={estilos.marcaSub}>{subtitulo}</Text> : null}
        </View>
      </View>
      <Text style={estilos.selo}>Prestação de contas</Text>
    </View>
  );
}

export function TituloRelatorio({ titulo, meta }: { titulo: string; meta: string }): React.ReactElement {
  return (
    <>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.meta}>{meta}</Text>
    </>
  );
}

export function Kpis({ itens, accent }: { itens: { num: string; label: string }[]; accent: string }): React.ReactElement | null {
  if (itens.length === 0) return null;
  return (
    <View style={estilos.kpis}>
      {itens.map((k, i) => (
        <View key={i} style={[estilos.kpi, { borderTopColor: accent }]}>
          <Text style={estilos.kpiNum}>{k.num}</Text>
          <Text style={estilos.kpiLabel}>{k.label}</Text>
        </View>
      ))}
    </View>
  );
}

export interface BarraItem {
  label: string;
  /** Texto à direita (ex.: "67%" ou "R$ 400 mil"). */
  valor: string;
  /** Fração 0–100 do trilho. */
  pct: number;
  cor: string;
}

export function Distribuicoes({ titulo, itens }: { titulo: string; itens: BarraItem[] }): React.ReactElement | null {
  if (itens.length === 0) return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={estilos.secTitulo}>{titulo}</Text>
      {itens.map((b, i) => (
        <View key={i} style={estilos.barraLinha}>
          <Text style={estilos.barraRotulo}>{b.label}</Text>
          <View style={estilos.barraTrilho}>
            <View style={[estilos.barraPreenche, { width: `${Math.max(2, Math.min(100, b.pct))}%`, backgroundColor: b.cor }]} />
          </View>
          <Text style={estilos.barraValor}>{b.valor}</Text>
        </View>
      ))}
    </View>
  );
}

export function Analise({ pontos, accent, titulo = "Leitura do período" }: { pontos: string[]; accent: string; titulo?: string }): React.ReactElement | null {
  if (pontos.length === 0) return null;
  return (
    <View style={[estilos.analise, { borderLeftColor: accent }]} wrap={false}>
      <Text style={estilos.analiseTitulo}>{titulo}</Text>
      {pontos.map((p, i) => (
        <View key={i} style={estilos.analiseItem}>
          <Text style={estilos.analiseBolinha}>•</Text>
          <Text style={estilos.analiseTexto}>{p}</Text>
        </View>
      ))}
    </View>
  );
}

export interface ColunaKit {
  header: string;
  largura: string;
  /** Renderiza a célula como pílula colorida (ex.: status). */
  pilula?: boolean;
}

export function Tabela({
  colunas,
  linhas,
  accent,
  coresPilula,
}: {
  colunas: ColunaKit[];
  linhas: string[][];
  accent: string;
  /** Mapa valor→cor para colunas com `pilula`. Faltando = cinza. */
  coresPilula?: Record<string, string>;
}): React.ReactElement {
  return (
    <View>
      <View style={[estilos.thead, { borderBottomColor: accent }]} fixed>
        {colunas.map((c, i) => (
          <Text key={i} style={[estilos.th, { width: c.largura }]}>
            {c.header}
          </Text>
        ))}
      </View>
      {linhas.map((linha, i) => (
        <View key={i} style={[estilos.tr, i % 2 === 1 ? { backgroundColor: TINTA.zebra } : {}]} wrap={false}>
          {colunas.map((c, j) => {
            const valor = linha[j] ?? "";
            if (c.pilula && valor) {
              const cor = coresPilula?.[valor] ?? TINTA.fraco;
              return (
                <View key={j} style={{ width: c.largura }}>
                  <Text style={[estilos.pilula, { backgroundColor: tintaDeFundo(cor), color: cor }]}>{valor}</Text>
                </View>
              );
            }
            return (
              <Text key={j} style={[estilos.td, { width: c.largura }]}>
                {valor}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function Rodape({ nome, titulo }: { nome: string; titulo: string }): React.ReactElement {
  return (
    <View style={estilos.footer} fixed>
      <Text style={estilos.footerTxt} render={({ pageNumber, totalPages }) => `${nome} · ${titulo} · página ${pageNumber} de ${totalPages}`} />
      <Text style={estilos.footerTxt}>Inteligência por Guerrilheiros</Text>
    </View>
  );
}

export function dataHoraPdf(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Fundo bem claro derivado de uma cor de pílula (hex #RRGGBB) para o texto respirar. */
function tintaDeFundo(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#F0F0F0";
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // mistura ~15% da cor com branco
  const mix = (c: number) => Math.round(c * 0.15 + 255 * 0.85);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

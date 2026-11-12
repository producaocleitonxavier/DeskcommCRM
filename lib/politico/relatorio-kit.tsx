// lib/politico/relatorio-kit.tsx
/**
 * KIT VISUAL dos relatórios do Gabinete em PDF (@react-pdf/renderer) — a
 * IDENTIDADE GIP: capa marinho com o filete lima, números em cartões com espinha
 * colorida, gráfico de composição em cores, tabela com cabeçalho marinho. Um só
 * kit para Demandas, Prestação de Contas, Lideranças, Emendas, Projetos, Obras,
 * Visitas, Locais, Multiplicadores e Pesquisas — o timbre não diverge.
 *
 * O relatório é o que o gabinete MOSTRA para fora: é peça de imagem, não extrato.
 * Por isso a paleta é a da ferramenta (marinho + lima), e não a cor genérica da
 * instalação — o parâmetro `accent` segue na assinatura por compatibilidade, mas
 * os elementos estruturais usam as cores da marca GIP abaixo.
 *
 * Contraste: texto corrido sempre escuro sobre claro, ou branco sobre marinho.
 * O lima só entra em FILETES e marcas (nunca em texto sobre branco). As cores de
 * gráfico (`CORES_GRAFICO`) foram validadas para daltonismo e sempre vêm com
 * legenda escrita — identidade nunca depende só da cor.
 */
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import React from "react";

// Sem hifenização automática: a regra embutida é a do inglês e quebra errado em pt-BR.
Font.registerHyphenationCallback((palavra) => [palavra]);

/** Marca GIP. */
export const MARCA = {
  marinho: "#14233A",
  marinhoClaro: "#24415E",
  lima: "#C4E64A",
  limaTexto: "#D7F36A", // lima para texto sobre marinho
} as const;

/** Paleta categórica dos gráficos (ordem fixa; validada para daltonismo). */
export const CORES_GRAFICO = ["#2F6FB5", "#17A673", "#E08A1E", "#8B5CF6", "#D9486A", "#0E9AA7"] as const;

export const TINTA = {
  forte: "#14233A",
  texto: "#263445",
  medio: "#5B6B80",
  fraco: "#8A97A8",
  linha: "#DDE4EE",
  zebra: "#F5F8FC",
  trilho: "#E6ECF4",
  caixa: "#EEF3F9",
} as const;

const MARGEM = 34;

export const estilos = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 46, paddingHorizontal: 0, fontSize: 9, color: TINTA.texto, fontFamily: "Helvetica" },
  // Filete lima no topo absoluto de TODA página (assinatura da marca).
  faixaTopo: { height: 5 },
  corpo: { paddingHorizontal: MARGEM },

  // Capa marinho (só na 1ª página): identidade do mandato + selo da ferramenta.
  cabecalho: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: -MARGEM,
    paddingHorizontal: MARGEM,
    paddingTop: 20,
    paddingBottom: 14,
    backgroundColor: MARCA.marinho,
  },
  cabecalhoEsq: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoMoldura: { width: 50, height: 50, borderRadius: 8, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  logo: { width: 42, height: 42, objectFit: "contain" },
  marcaNome: { fontSize: 16, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.2 },
  marcaSub: { fontSize: 8.5, color: "#B9C7DA", marginTop: 3 },
  seloBloco: { alignItems: "flex-end" },
  selo: { fontSize: 7.5, fontWeight: 700, color: MARCA.limaTexto, textTransform: "uppercase", letterSpacing: 1.6 },
  seloSub: { fontSize: 7, color: "#93A5BD", marginTop: 3, letterSpacing: 0.4 },

  // Título do relatório: continua a capa marinho, separado por um fio.
  tituloBloco: {
    marginHorizontal: -MARGEM,
    paddingHorizontal: MARGEM,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: MARCA.marinho,
    borderTopWidth: 0.5,
    borderTopColor: MARCA.marinhoClaro,
    marginBottom: 18,
  },
  tituloFilete: { width: 34, height: 3, borderRadius: 2, backgroundColor: MARCA.lima, marginBottom: 8 },
  titulo: { fontSize: 19, fontWeight: 700, color: "#FFFFFF", marginBottom: 4, letterSpacing: 0.1 },
  meta: { fontSize: 8.5, color: "#B9C7DA" },

  kpis: { flexDirection: "row", gap: 9, marginBottom: 12 },
  kpi: { flex: 1, backgroundColor: TINTA.zebra, borderRadius: 7, borderLeftWidth: 3.5, paddingVertical: 10, paddingHorizontal: 12 },
  kpiDestaque: { backgroundColor: MARCA.marinho },
  kpiNum: { fontSize: 19, fontWeight: 700, color: TINTA.forte },
  kpiLabel: { fontSize: 7.5, color: TINTA.medio, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },

  secLinha: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 9 },
  secMarca: { width: 7, height: 7, borderRadius: 2, backgroundColor: MARCA.lima },
  secTitulo: { fontSize: 9.5, fontWeight: 700, color: TINTA.forte, marginTop: 8, marginBottom: 9, textTransform: "uppercase", letterSpacing: 0.8 },
  secTituloEmLinha: { fontSize: 9.5, fontWeight: 700, color: TINTA.forte, textTransform: "uppercase", letterSpacing: 0.8 },

  barraLinha: { flexDirection: "row", alignItems: "center", marginBottom: 7, gap: 8 },
  barraRotulo: { width: 130, fontSize: 8.5, color: TINTA.texto },
  barraTrilho: { flex: 1, height: 10, backgroundColor: TINTA.trilho, borderRadius: 5 },
  barraPreenche: { height: 10, borderRadius: 5 },
  barraValor: { width: 70, fontSize: 8.5, fontWeight: 700, color: TINTA.forte, textAlign: "right" },

  composicaoBarra: { flexDirection: "row", height: 16, borderRadius: 8, overflow: "hidden", backgroundColor: TINTA.trilho, gap: 2 },
  legenda: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 },
  legendaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendaCor: { width: 8, height: 8, borderRadius: 2 },
  legendaTexto: { fontSize: 8.5, color: TINTA.texto },
  legendaNum: { fontSize: 8.5, fontWeight: 700, color: TINTA.forte },

  analise: { backgroundColor: TINTA.caixa, borderLeftWidth: 3.5, borderLeftColor: MARCA.lima, borderRadius: 6, paddingVertical: 11, paddingHorizontal: 13, marginBottom: 16 },
  analiseTitulo: { fontSize: 9, fontWeight: 700, color: TINTA.forte, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },
  analiseItem: { flexDirection: "row", gap: 6, marginBottom: 3.5 },
  analiseBolinha: { fontSize: 8.5, color: CORES_GRAFICO[0] },
  analiseTexto: { fontSize: 9, color: TINTA.texto, lineHeight: 1.45, flex: 1 },

  thead: { flexDirection: "row", backgroundColor: MARCA.marinho, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 6, marginBottom: 1 },
  th: { fontSize: 8, fontWeight: 700, color: "#FFFFFF", paddingRight: 4, letterSpacing: 0.2 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: TINTA.linha, paddingVertical: 5.5, paddingHorizontal: 6 },
  td: { fontSize: 8.5, color: TINTA.texto, paddingRight: 4 },
  tdPrimeira: { fontWeight: 700, color: TINTA.forte },
  pilula: { alignSelf: "flex-start", borderRadius: 8, paddingVertical: 1.5, paddingHorizontal: 6, fontSize: 7.5, fontWeight: 700 },

  footer: { position: "absolute", bottom: 18, left: MARGEM, right: MARGEM, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: MARCA.marinho, paddingTop: 6 },
  footerTxt: { fontSize: 7, color: TINTA.medio },
  footerMarca: { fontSize: 7, fontWeight: 700, color: TINTA.forte, letterSpacing: 0.6 },
});

// ── Componentes ────────────────────────────────────────────────────────────

/** Filete lima no topo de toda página. `accent` é ignorado (identidade fixa da ferramenta). */
export function FaixaTopo(_props: { accent: string }): React.ReactElement {
  return <View style={[estilos.faixaTopo, { backgroundColor: MARCA.lima }]} fixed />;
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
        {logoUrl ? (
          <View style={estilos.logoMoldura}>
            <Image src={logoUrl} style={estilos.logo} />
          </View>
        ) : null}
        <View>
          <Text style={estilos.marcaNome}>{nome}</Text>
          {subtitulo ? <Text style={estilos.marcaSub}>{subtitulo}</Text> : null}
        </View>
      </View>
      <View style={estilos.seloBloco}>
        <Text style={estilos.selo}>Relatório do mandato</Text>
        <Text style={estilos.seloSub}>GIP · Guerrilheiros Inteligência Política</Text>
      </View>
    </View>
  );
}

export function TituloRelatorio({ titulo, meta }: { titulo: string; meta: string }): React.ReactElement {
  return (
    <View style={estilos.tituloBloco}>
      <View style={estilos.tituloFilete} />
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.meta}>{meta}</Text>
    </View>
  );
}

/**
 * Cartões de número. O primeiro vai em marinho (o número que abre a leitura); os
 * demais em cartão claro com a espinha na cor do gráfico — a mesma ordem de cores
 * da paleta, para a página ter cor sem virar carnaval.
 */
export function Kpis({ itens }: { itens: { num: string; label: string }[]; accent: string }): React.ReactElement | null {
  if (itens.length === 0) return null;
  return (
    <View style={estilos.kpis}>
      {itens.map((k, i) => {
        const destaque = i === 0;
        const cor = destaque ? MARCA.lima : CORES_GRAFICO[(i - 1) % CORES_GRAFICO.length]!;
        return (
          <View key={i} style={[estilos.kpi, { borderLeftColor: cor }, destaque ? estilos.kpiDestaque : {}]}>
            <Text style={[estilos.kpiNum, destaque ? { color: "#FFFFFF" } : {}]}>{k.num}</Text>
            <Text style={[estilos.kpiLabel, destaque ? { color: "#B9C7DA" } : {}]}>{k.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Título de seção com a marca lima — use no lugar de `estilos.secTitulo` solto. */
export function TituloSecao({ children }: { children: string }): React.ReactElement {
  return (
    <View style={estilos.secLinha}>
      <View style={estilos.secMarca} />
      <Text style={estilos.secTituloEmLinha}>{children}</Text>
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
    <View style={{ marginBottom: 14 }} wrap={false}>
      <TituloSecao>{titulo}</TituloSecao>
      {itens.map((b, i) => (
        <View key={i} style={estilos.barraLinha}>
          <Text style={estilos.barraRotulo}>{b.label}</Text>
          <View style={estilos.barraTrilho}>
            <View style={[estilos.barraPreenche, { width: b.pct <= 0 ? 0 : `${Math.max(2, Math.min(100, b.pct))}%`, backgroundColor: b.cor }]} />
          </View>
          <Text style={estilos.barraValor}>{b.valor}</Text>
        </View>
      ))}
    </View>
  );
}

export interface FatiaComposicao {
  label: string;
  valor: number;
  cor: string;
}

/**
 * Composição de um total em partes (ex.: visitas por situação): UMA barra
 * segmentada em cores + legenda com rótulo, quantidade e percentual. A legenda é
 * obrigatória — é ela que diz o que cada cor é, mesmo em impressão P&B.
 */
export function Composicao({ titulo, itens }: { titulo: string; itens: FatiaComposicao[] }): React.ReactElement | null {
  const validos = itens.filter((f) => f.valor > 0);
  const total = validos.reduce((s, f) => s + f.valor, 0);
  if (total <= 0) return null;
  return (
    <View style={{ marginBottom: 16 }} wrap={false}>
      <TituloSecao>{titulo}</TituloSecao>
      <View style={estilos.composicaoBarra}>
        {validos.map((f, i) => (
          <View key={i} style={{ flexGrow: f.valor, flexBasis: 0, backgroundColor: f.cor }} />
        ))}
      </View>
      <View style={estilos.legenda}>
        {validos.map((f, i) => (
          <View key={i} style={estilos.legendaItem}>
            <View style={[estilos.legendaCor, { backgroundColor: f.cor }]} />
            <Text style={estilos.legendaTexto}>{f.label}</Text>
            <Text style={estilos.legendaNum}>
              {f.valor} · {Math.round((f.valor * 100) / total)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Analise({ pontos, titulo = "Leitura do período" }: { pontos: string[]; accent: string; titulo?: string }): React.ReactElement | null {
  if (pontos.length === 0) return null;
  return (
    <View style={estilos.analise} wrap={false}>
      <Text style={estilos.analiseTitulo}>{titulo}</Text>
      {pontos.map((p, i) => (
        <View key={i} style={estilos.analiseItem}>
          <Text style={estilos.analiseBolinha}>■</Text>
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
      <View style={estilos.thead} fixed>
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
              const cor = coresPilula?.[valor] ?? TINTA.medio;
              return (
                <View key={j} style={{ width: c.largura }}>
                  <Text style={[estilos.pilula, { backgroundColor: tintaDeFundo(cor), color: cor }]}>{valor}</Text>
                </View>
              );
            }
            return (
              <Text key={j} style={[estilos.td, j === 0 ? estilos.tdPrimeira : {}, { width: c.largura }]}>
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
      <Text style={estilos.footerMarca}>GIP · INTELIGÊNCIA POR GUERRILHEIROS</Text>
    </View>
  );
}

export function dataHoraPdf(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Fundo bem claro derivado de uma cor de pílula (hex #RRGGBB) para o texto respirar. */
function tintaDeFundo(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#EEF1F5";
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // mistura ~15% da cor com branco
  const mix = (c: number) => Math.round(c * 0.15 + 255 * 0.85);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * PAINEL DE EMENDAS — derivação pura (sem banco, sem React), sensível ao TIPO
 * DE MANDATO. É o cérebro por trás do painel de Indicadores (no estilo dos
 * melhores sistemas de gabinete): os 3 números grandes, por ano, por área e por
 * região. A lente muda com o mandato:
 *
 *  - DEPUTADO (estadual/federal): o destino é o MUNICÍPIO; a região é a
 *    MESO-REGIÃO do estado.
 *  - VEREADOR / PREFEITO: o destino é o BAIRRO da cidade; a região também é o
 *    bairro (não há meso-região dentro de uma cidade).
 *
 * Regra de dinheiro: um PEDIDO ('solicitada') e um RASCUNHO ainda NÃO são
 * dinheiro alocado — ficam de fora de toda soma financeira e da contagem de
 * "indicações". Pedido aparece só como fila de captação.
 *
 * Puro de propósito: recebe as linhas já lidas e devolve os agregados. Assim o
 * teste prova a conta sem subir Supabase.
 */

export type TipoMandato = "vereador" | "prefeito" | "dep_estadual" | "dep_federal";

/** Status que NÃO contam como indicação nem como dinheiro (ainda não decididos). */
export const STATUS_NAO_DECIDIDOS = ["solicitada", "rascunho"] as const;
export const STATUS_SOLICITADA = "solicitada";

export interface EmendaLite {
  id: string;
  ano: number;
  status: string;
  /** chave crua de área temática (saude, educacao, ...). */
  area: string;
  municipio: string | null;
  bairro: string | null;
  mesoRegiao: string | null;
  modalidade: string | null;
  valorIndicadoCents: number;
  valorPagoCents: number;
}

export interface FatiaValor {
  nome: string;
  valorCents: number;
}

export interface PainelEmendas {
  tipo: TipoMandato;
  /** "municipio" (deputado) | "bairro" (vereador/prefeito). */
  grauDestino: "municipio" | "bairro";
  /** Os 3 números grandes do topo. */
  kpis: {
    destinosAtendidos: number;
    totalIndicacoes: number;
    valorTotalIndicadoCents: number;
  };
  /** Segunda faixa: o ciclo do dinheiro (nossa vantagem sobre quem só mostra "pago"). */
  financeiro: {
    alocadoCents: number; // indicado
    executadoCents: number; // pago
    pendenteCents: number; // alocado - pago
  };
  /** Quantos pedidos ('solicitada') estão na fila aguardando decisão. */
  pedidosAguardando: number;
  porAno: { ano: number; valorCents: number }[];
  porArea: FatiaValor[];
  porRegiao: FatiaValor[];
  porModalidade: FatiaValor[];
}

export const AREA_LABELS: Record<string, string> = {
  saude: "Saúde",
  educacao: "Educação",
  seguranca: "Segurança",
  assistencia_social: "Assist. Social",
  infraestrutura: "Infraestrutura",
  cultura: "Cultura",
  esporte: "Esporte",
  meio_ambiente: "Meio Ambiente",
  agricultura: "Agricultura",
  tecnologia: "Tecnologia",
  outro: "Outro",
};

/** Deputado olha por município; vereador/prefeito, por bairro da cidade. */
export function grauDoDestino(tipo: TipoMandato): "municipio" | "bairro" {
  return tipo === "dep_estadual" || tipo === "dep_federal" ? "municipio" : "bairro";
}

export interface ResumoMunicipio {
  municipio: string;
  total: number;
  indicadoCents: number;
  pagoCents: number;
  /** % de execução (pago / indicado), 0–100 inteiro. */
  execPct: number;
}

/**
 * Agrega as emendas DECIDIDAS por MUNICÍPIO (o "Relatório por Município" à la
 * Tramonte): quantas, quanto indicado, quanto pago e o % de execução. Emenda sem
 * município cai em "Não informado" (não some do relatório). Ordena por valor
 * indicado desc. Puro.
 */
export function resumoPorMunicipio(rows: EmendaLite[]): ResumoMunicipio[] {
  // Chave sem acento/caixa: "BELO HORIZONTE" e "Belo Horizonte" são a mesma cidade.
  const m = new Map<string, { nome: string; total: number; indicadoCents: number; pagoCents: number }>();
  for (const e of rows) {
    if (!ehDecidida(e.status)) continue;
    const bruto = (e.municipio ?? "").trim() || "Não informado";
    const nome = bruto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const cur = m.get(nome) ?? { nome: bruto, total: 0, indicadoCents: 0, pagoCents: 0 };
    cur.total += 1;
    cur.indicadoCents += e.valorIndicadoCents || 0;
    cur.pagoCents += e.valorPagoCents || 0;
    m.set(nome, cur);
  }
  return [...m.entries()]
    .map(([, v]) => ({
      municipio: v.nome,
      total: v.total,
      indicadoCents: v.indicadoCents,
      pagoCents: v.pagoCents,
      execPct: v.indicadoCents > 0 ? Math.round((v.pagoCents / v.indicadoCents) * 100) : 0,
    }))
    .sort((a, b) => b.indicadoCents - a.indicadoCents || a.municipio.localeCompare(b.municipio, "pt-BR"));
}

function ehDecidida(status: string): boolean {
  return !(STATUS_NAO_DECIDIDOS as readonly string[]).includes(status);
}

/** Chave do destino conforme o mandato (nome do município OU do bairro). */
function destinoDaEmenda(e: EmendaLite, grau: "municipio" | "bairro"): string | null {
  const bruto = grau === "municipio" ? e.municipio : e.bairro;
  const v = (bruto ?? "").trim();
  return v || null;
}

/** Nome da região conforme o mandato (meso-região p/ deputado, bairro p/ vereador). */
function regiaoDaEmenda(e: EmendaLite, grau: "municipio" | "bairro"): string | null {
  const bruto = grau === "municipio" ? e.mesoRegiao : e.bairro;
  const v = (bruto ?? "").trim();
  return v || null;
}

function somarPorChave<T>(itens: T[], chave: (t: T) => string | null, valor: (t: T) => number): FatiaValor[] {
  const m = new Map<string, number>();
  for (const it of itens) {
    const k = chave(it);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + valor(it));
  }
  return [...m.entries()].map(([nome, valorCents]) => ({ nome, valorCents })).sort((a, b) => b.valorCents - a.valorCents);
}

/**
 * Deriva TODO o painel a partir das emendas + o tipo de mandato. Nenhuma linha
 * 'solicitada'/'rascunho' entra em dinheiro ou contagem de indicações.
 */
export function derivarPainel(rows: EmendaLite[], tipo: TipoMandato): PainelEmendas {
  const grauDestino = grauDoDestino(tipo);
  const decididas = rows.filter((e) => ehDecidida(e.status));

  // Destinos distintos atendidos (município p/ deputado, bairro p/ vereador).
  const destinos = new Set<string>();
  for (const e of decididas) {
    const d = destinoDaEmenda(e, grauDestino);
    if (d) destinos.add(d.toLowerCase());
  }

  const alocadoCents = decididas.reduce((s, e) => s + (e.valorIndicadoCents || 0), 0);
  const executadoCents = decididas.reduce((s, e) => s + (e.valorPagoCents || 0), 0);

  return {
    tipo,
    grauDestino,
    kpis: {
      destinosAtendidos: destinos.size,
      totalIndicacoes: decididas.length,
      valorTotalIndicadoCents: alocadoCents,
    },
    financeiro: {
      alocadoCents,
      executadoCents,
      pendenteCents: Math.max(0, alocadoCents - executadoCents),
    },
    pedidosAguardando: rows.filter((e) => e.status === STATUS_SOLICITADA).length,
    porAno: [...decididas.reduce((m, e) => m.set(e.ano, (m.get(e.ano) ?? 0) + (e.valorIndicadoCents || 0)), new Map<number, number>())]
      .map(([ano, valorCents]) => ({ ano, valorCents }))
      .sort((a, b) => a.ano - b.ano),
    porArea: somarPorChave(decididas, (e) => e.area || "outro", (e) => e.valorIndicadoCents || 0),
    porRegiao: somarPorChave(decididas, (e) => regiaoDaEmenda(e, grauDestino), (e) => e.valorIndicadoCents || 0).slice(0, 6),
    porModalidade: somarPorChave(decididas, (e) => (e.modalidade ?? "").trim() || null, (e) => e.valorIndicadoCents || 0),
  };
}

/**
 * COBRANÇA POR ÓRGÃO — regra pura do painel de demandas por órgão de destino.
 *
 * O gabinete trabalha por ÓRGÃO (COPASA, CEMIG, Prefeitura, Secretaria…): manda
 * ofício e cobra. Esta lib agrupa as demandas por órgão e conta o que importa
 * pra cobrança — quantas estão ATRASADAS e quantas estão SEM RESPOSTA. Tudo
 * determinístico e testável; sem efeito colateral e sem imports de supabase/next.
 */

export interface DemandaCobranca {
  orgao: string | null;
  estado: string;
  abertaEm: string;
  prazoDias: number | null;
  respondeu: boolean;
}

export interface OrgaoRollup {
  orgao: string;
  total: number;
  atrasadas: number;
  semResposta: number;
}

/** Estados em que a demanda já saiu da mesa (não cobramos mais). */
const ESTADOS_FECHADOS = new Set(["resolvida", "encerrada"]);
/** Mesmo padrão da lista: sem prazo acordado, conta 30 dias. */
const PRAZO_PADRAO_DIAS = 30;

/** Apara e colapsa espaços. NÃO força caixa — a grafia vem da escolha rápida. */
export function normalizarOrgao(nome: string | null | undefined): string {
  return (nome ?? "").replace(/\s+/g, " ").trim();
}

// Paleta suave (mesma linguagem das pílulas do sistema). bg translúcido + cor legível.
const PALETA: { bg: string; color: string }[] = [
  { bg: "rgba(59,130,246,0.15)", color: "#93B4EA" },   // azul
  { bg: "rgba(34,197,94,0.15)", color: "#7AD4AB" },    // verde
  { bg: "rgba(168,85,247,0.15)", color: "#C4B5FD" },   // roxo
  { bg: "rgba(245,158,11,0.15)", color: "#E4B96E" },   // âmbar
  { bg: "rgba(236,72,153,0.15)", color: "#F0A6C8" },   // rosa
  { bg: "rgba(20,184,166,0.15)", color: "#6FD6C8" },   // teal
  { bg: "rgba(129,140,248,0.16)", color: "#A5B4FC" },  // índigo
  { bg: "rgba(217,164,75,0.16)", color: "#D9A44B" },   // ouro
  { bg: "rgba(14,165,233,0.15)", color: "#7DC7EE" },   // ciano
  { bg: "rgba(139,195,74,0.16)", color: "#B6D97A" },   // lima
];
const CINZA_NEUTRO = { bg: "rgba(255,255,255,0.07)", color: "#9CA3AF" };

/**
 * Cor determinística por órgão: mesmo nome → sempre a mesma pílula. Hash simples
 * (soma dos códigos) sobre o nome normalizado → índice na paleta. Vazio → cinza.
 */
export function corDoOrgao(nome: string): { bg: string; color: string } {
  const n = normalizarOrgao(nome);
  if (!n) return CINZA_NEUTRO;
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h + n.charCodeAt(i) * (i + 1)) % 100000;
  return PALETA[h % PALETA.length]!;
}

/** Replica a regra de atraso da lista (puro, sem depender de Date externa). */
function estaAtrasada(abertaEm: string, prazoDias: number | null): boolean {
  const dias = prazoDias && prazoDias > 0 ? prazoDias : PRAZO_PADRAO_DIAS;
  const limite = new Date(abertaEm).getTime() + dias * 86400000;
  return Date.now() > limite;
}

/**
 * Agrupa por órgão (normalizado), ignorando demandas sem órgão. Conta total,
 * `atrasadas` (prazo vencido E ainda aberta) e `semResposta` (órgão não respondeu
 * E ainda aberta). Ordena por total desc, depois atrasadas desc. Nunca lança.
 */
export function rollupPorOrgao(itens: DemandaCobranca[]): OrgaoRollup[] {
  const mapa = new Map<string, OrgaoRollup>();
  for (const it of itens ?? []) {
    const orgao = normalizarOrgao(it.orgao);
    if (!orgao) continue;
    const r = mapa.get(orgao) ?? { orgao, total: 0, atrasadas: 0, semResposta: 0 };
    r.total += 1;
    const aberta = !ESTADOS_FECHADOS.has(it.estado);
    if (aberta && estaAtrasada(it.abertaEm, it.prazoDias)) r.atrasadas += 1;
    if (aberta && !it.respondeu) r.semResposta += 1;
    mapa.set(orgao, r);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || b.atrasadas - a.atrasadas || a.orgao.localeCompare(b.orgao, "pt-BR"));
}

export interface AlertaCobranca {
  total: number;
  porOrgao: { orgao: string; qtd: number }[]; // ordenado por qtd desc
}

/**
 * AVISO PROATIVO de cobrança (fase 2a): as demandas que mais queimam — abertas,
 * ATRASADAS e SEM resposta do órgão. É o subconjunto urgente do "precisa cobrar"
 * (sem resposta), filtrado pelas que já passaram do prazo. Alimenta o banner do
 * topo ("X atrasadas sem resposta — cobrar agora"). Nunca lança.
 */
export function alertaCobranca(itens: DemandaCobranca[]): AlertaCobranca {
  const mapa = new Map<string, number>();
  let total = 0;
  for (const it of itens ?? []) {
    if (ESTADOS_FECHADOS.has(it.estado)) continue;
    if (it.respondeu) continue;
    if (!estaAtrasada(it.abertaEm, it.prazoDias)) continue;
    total += 1;
    const orgao = normalizarOrgao(it.orgao) || "Sem órgão";
    mapa.set(orgao, (mapa.get(orgao) ?? 0) + 1);
  }
  const porOrgao = [...mapa.entries()]
    .map(([orgao, qtd]) => ({ orgao, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.orgao.localeCompare(b.orgao, "pt-BR"));
  return { total, porOrgao };
}

/** Órgãos comuns por esfera — chips de escolha rápida (padroniza a grafia). */
export const ORGAOS_COMUNS: Record<"municipal" | "estadual" | "federal", string[]> = {
  municipal: [
    "Prefeitura (PBH)", "COPASA", "CEMIG", "SLU", "BHTRANS", "SUDECAP",
    "Sec. de Saúde", "Sec. de Educação", "Sec. de Obras", "SMASAC (Assistência)",
    "Guarda Municipal", "Defesa Civil", "Ouvidoria",
  ],
  estadual: [
    "COPASA", "CEMIG", "DER-MG", "Sec. Estadual de Saúde", "Sec. Estadual de Educação",
    "PMMG", "IEF", "SEAPA", "SEPLAG", "Ouvidoria",
  ],
  federal: [
    "Ministério da Saúde", "Ministério da Educação", "Ministério das Cidades",
    "FUNASA", "DNIT", "Caixa Econômica", "Ouvidoria",
  ],
};

/** Chips sugeridos conforme o tipo de mandato (dep_federal→federal, dep_estadual→estadual, resto→municipal). */
export function orgaosSugeridos(tipo: string | null | undefined): string[] {
  if (tipo === "dep_federal") return ORGAOS_COMUNS.federal;
  if (tipo === "dep_estadual") return ORGAOS_COMUNS.estadual;
  return ORGAOS_COMUNS.municipal;
}

/**
 * "Precisa cobrar": a demanda ainda está na mesa (aberta) E o órgão não respondeu.
 * É o worklist de cobrança do gabinete — o que exige um empurrão hoje.
 */
export function precisaCobrar(d: { estado: string; respondeu: boolean }): boolean {
  return !ESTADOS_FECHADOS.has(d.estado) && !d.respondeu;
}

/**
 * Ordena o painel "Por órgão" por URGÊNCIA (o que queima primeiro): mais
 * atrasadas na frente, depois mais sem resposta, depois maior volume, e por fim
 * alfabética. Comparador puro (use com [...rollup].sort(ordenarUrgencia)).
 */
export function ordenarUrgencia(a: OrgaoRollup, b: OrgaoRollup): number {
  return (
    b.atrasadas - a.atrasadas ||
    b.semResposta - a.semResposta ||
    b.total - a.total ||
    a.orgao.localeCompare(b.orgao, "pt-BR")
  );
}

/**
 * Corpo de um ofício de COBRANÇA (reiteração) — o gabinete mandou o pedido, o
 * órgão não respondeu, e a gente cobra. Formal, pt-BR, SEM promessa de campanha.
 * Determinístico (não chama IA). Encaixa o nº do ofício anterior quando houver.
 */
export function textoCobranca(p: { rotuloAnterior?: string | null; assunto?: string | null }): string {
  const rotulo = (p.rotuloAnterior ?? "").trim();
  const assunto = (p.assunto ?? "").trim();
  const refOficio = rotulo ? `o Ofício nº ${rotulo}, expedido por este gabinete,` : `o ofício anteriormente encaminhado por este gabinete,`;
  const refAssunto = assunto ? `referente a ${assunto},` : `referente à demanda em referência,`;
  return (
    `Reitero a Vossa Senhoria ${refOficio} ${refAssunto} o qual, até o presente momento, ` +
    `não obteve resposta. Considerando a relevância do pleito para a população atendida, ` +
    `solicito a especial gentileza de informar o andamento e as providências adotadas. ` +
    `Renovo protestos de elevada estima e consideração.`
  );
}

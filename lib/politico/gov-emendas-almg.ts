/**
 * Integração com a ALMG (Assembleia Legislativa de Minas Gerais) — EMENDAS
 * parlamentares ESTADUAIS. A API v2 de dados abertos da ALMG NÃO expõe emendas;
 * a fonte oficial é um CSV único com TODAS as emendas do estado (atualização
 * BIMESTRAL): autor, ano, número da indicação, status, valores (indicado /
 * utilizado / empenhado / pago), beneficiário, município e função.
 *
 * Serve para DEPUTADO ESTADUAL de MG. Vereador municipal / deputado federal
 * volta vazio (o nome não está nesta base) — e isso é ok, igual ao sync federal.
 *
 * Detalhes do arquivo que ESTE módulo trata (provado contra o arquivo real):
 *   - encoding Latin-1 (ISO-8859-1), separador ";", campos às vezes entre aspas
 *     (precisa de parser quote-aware, nunca split);
 *   - valores no formato "R$64.000,00" (prefixo R$ + milhar "." + decimal ",");
 *   - cada (ano, número da indicação) é ÚNICO (sem agregação por linha);
 *   - Status da Indicação ∈ {APROVADO, REPROVADO PELO ÓRGÃO} — só as APROVADAS
 *     entram (reprovada não virou entrega, e nosso status não tem "reprovada").
 *
 * Sem imports de supabase/next: as funções puras são testáveis; só
 * `buscarEmendasAlmg` toca a rede.
 */

/**
 * CSV oficial de emendas da ALMG (todas as emendas estaduais de MG).
 * ATENÇÃO: o servidor da ALMG bloqueia IPs fora do Brasil (ex. a VPS) — a
 * busca direta dá ETIMEDOUT. Em produção/homologação apontamos para um ESPELHO
 * do arquivo (Supabase Storage, que a VPS alcança) via `ALMG_EMENDAS_CSV_URL`,
 * atualizado a cada 2 meses (ritmo de publicação da ALMG). O default abaixo só
 * vale onde a ALMG é alcançável (ex. a máquina que atualiza o espelho).
 */
export const ALMG_EMENDAS_CSV_URL_OFICIAL =
  "https://mediaserver.almg.gov.br/acervo/497/469/2497469.csv";

/** Fonte efetiva do CSV: o espelho (env) quando houver, senão o oficial. */
export function urlDoCsvAlmg(): string {
  return (process.env.ALMG_EMENDAS_CSV_URL ?? "").trim() || ALMG_EMENDAS_CSV_URL_OFICIAL;
}

export interface EmendaAlmg {
  ano: number;
  numero: string; // "Número da Indicação" (pol_emendas.numero é TEXT)
  autor: string | null;
  statusIndicacao: string | null;
  funcao: string | null;
  acao: string | null;
  municipio: string | null;
  beneficiario: string | null;
  cnpj: string | null;
  descricao: string | null;
  indicadoCents: number;
  utilizadoCents: number;
  empenhadoCents: number;
  pagoCents: number;
}

/**
 * Parser CSV mínimo e quote-aware para separador ";" (padrão BR). Respeita
 * aspas duplas e o escape "" dentro de aspas, e newline dentro de campo citado.
 * Devolve uma matriz de linhas (array de células como string).
 */
export function parsearCsvPontoEVirgula(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let emAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (emAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          celula += '"';
          i++;
        } else {
          emAspas = false;
        }
      } else {
        celula += ch;
      }
    } else if (ch === '"') {
      emAspas = true;
    } else if (ch === ";") {
      linha.push(celula);
      celula = "";
    } else if (ch === "\n") {
      linha.push(celula);
      celula = "";
      // ignora linha totalmente vazia (ex. \n final)
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else if (ch === "\r") {
      // come o \r de CRLF
    } else {
      celula += ch;
    }
  }
  if (celula !== "" || linha.length) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas;
}

/** Normaliza texto p/ casar cabeçalho/nome: sem acento, maiúsculo, espaço único. */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface ColunasAlmg {
  ano: number;
  numero: number;
  statusIndicacao: number;
  autor: number;
  funcao: number;
  acao: number;
  municipio: number;
  beneficiario: number;
  cnpj: number;
  descricao: number;
  indicado: number;
  utilizado: number;
  empenhado: number;
  pago: number;
}

/**
 * Resolve os índices das colunas pelo CABEÇALHO (robusto a reordenação).
 * Casa por nome normalizado EXATO. Devolve -1 em coluna não encontrada.
 */
export function indicesDasColunas(header: string[]): ColunasAlmg {
  const norm = header.map((h) => normalizarTexto(h));
  const acharExato = (alvo: string) => norm.findIndex((h) => h === alvo);
  return {
    ano: acharExato("ANO DA INDICACAO"),
    numero: acharExato("NUMERO DA INDICACAO"),
    statusIndicacao: acharExato("STATUS DA INDICACAO"),
    autor: acharExato("AUTOR"),
    funcao: acharExato("FUNCAO DESCRICAO"),
    acao: acharExato("NOME DA ACAO"),
    municipio: acharExato("MUNICIPIO"),
    beneficiario: acharExato("NOME BENEFICIARIO"),
    cnpj: acharExato("NUMERO DO CNPJ DO BENEFICIARIO"),
    descricao: acharExato("DESCRICAO DA INDICACAO"),
    indicado: acharExato("VALOR INDICADO"),
    utilizado: acharExato("VALOR UTILIZADO"),
    empenhado: acharExato("VALOR EMPENHADO NO ANO"),
    pago: acharExato("VALOR PAGO ATUALIZADO"),
  };
}

/** "R$64.000,00" / "64.000,00" / "" -> centavos. Tolerante a prefixo e espaço. */
export function moedaRsBrParaCents(s: string | null | undefined): number {
  const t = (s ?? "").replace(/r\$/i, "").replace(/\s/g, "").trim();
  if (!t) return 0;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Status do ciclo a partir dos valores executados — bate com a régua
 * (indicada→empenhada→liquidada→paga). ALMG não tem "liquidado" próprio; o
 * "Valor Utilizado" é o melhor proxy. Devolve status válido do CHECK de
 * pol_emendas.
 */
export function statusAlmgPorExecucao(
  e: Pick<EmendaAlmg, "empenhadoCents" | "utilizadoCents" | "pagoCents">,
): "indicada" | "empenhada" | "liquidada" | "paga" {
  if ((e.pagoCents ?? 0) > 0) return "paga";
  if ((e.utilizadoCents ?? 0) > 0) return "liquidada";
  if ((e.empenhadoCents ?? 0) > 0) return "empenhada";
  return "indicada";
}

/** Indicação reprovada pelo órgão não virou entrega — fica de fora do sync. */
export function ehReprovada(statusIndicacao: string | null | undefined): boolean {
  return normalizarTexto(statusIndicacao).startsWith("REPROVAD");
}

/**
 * Converte as linhas já parseadas (com cabeçalho na 1ª) em emendas do `nomeAutor`
 * pedido. Casa o autor por nome normalizado EXATO (evita homônimo), pula
 * reprovadas e linhas sem ano/número. Função PURA — alimenta o teste sem rede.
 */
export function extrairEmendasDoAutor(
  linhas: string[][],
  nomeAutor: string,
): EmendaAlmg[] {
  if (linhas.length < 2) return [];
  const col = indicesDasColunas(linhas[0]);
  if (col.autor < 0 || col.ano < 0 || col.numero < 0) return [];
  const alvo = normalizarTexto(nomeAutor);
  if (!alvo) return [];

  const cel = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const out: EmendaAlmg[] = [];
  for (let k = 1; k < linhas.length; k++) {
    const r = linhas[k];
    if (normalizarTexto(cel(r, col.autor)) !== alvo) continue;
    const statusIndicacao = cel(r, col.statusIndicacao) || null;
    if (ehReprovada(statusIndicacao)) continue;
    const ano = parseInt(cel(r, col.ano), 10);
    const numero = cel(r, col.numero);
    if (!Number.isFinite(ano) || !numero) continue;
    out.push({
      ano,
      numero,
      autor: cel(r, col.autor) || null,
      statusIndicacao,
      funcao: cel(r, col.funcao) || null,
      acao: cel(r, col.acao) || null,
      municipio: cel(r, col.municipio) || null,
      beneficiario: cel(r, col.beneficiario) || null,
      cnpj: cel(r, col.cnpj) || null,
      descricao: cel(r, col.descricao) || null,
      indicadoCents: moedaRsBrParaCents(cel(r, col.indicado)),
      utilizadoCents: moedaRsBrParaCents(cel(r, col.utilizado)),
      empenhadoCents: moedaRsBrParaCents(cel(r, col.empenhado)),
      pagoCents: moedaRsBrParaCents(cel(r, col.pago)),
    });
  }
  return out;
}

/**
 * Baixa o CSV oficial da ALMG, decodifica Latin-1, parseia e devolve as emendas
 * do `nomeAutor`. Erro de rede/formato borbulha p/ a action tratar.
 */
export async function buscarEmendasAlmg(nomeAutor: string): Promise<EmendaAlmg[]> {
  const nome = (nomeAutor ?? "").trim();
  if (!nome) return [];
  const resp = await fetch(urlDoCsvAlmg(), {
    headers: { accept: "text/csv" },
    // o arquivo é grande (~36 MB) e muda a cada 2 meses; sem cache agressivo.
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`almg_http_${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const texto = buf.toString("latin1");
  const linhas = parsearCsvPontoEVirgula(texto);
  return extrairEmendasDoAutor(linhas, nome);
}

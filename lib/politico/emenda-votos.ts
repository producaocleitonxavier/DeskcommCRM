/**
 * DIFERENCIAL DE MERCADO — EMENDA × VOTO (puro, sem banco, sem React).
 *
 * Os bons sistemas de gabinete mostram "quanto investi" por destino. O nosso
 * cruza isso com "quanto votei ali" (TSE) — a leitura que ninguém mais entrega:
 *
 *  - FORTALEZA: investi onde já voto muito (consolida a base).
 *  - OPORTUNIDADE: investi onde quase não voto (semeia voto novo).
 *  - ACOMPANHAR: no meio.
 *
 * A lente é a mesma do painel — por MUNICÍPIO (deputado) ou por BAIRRO
 * (vereador). Esta camada só FAZ A CONTA: recebe os destinos (com valor) e os
 * votos por destino; devolve o cruzamento. Quem busca no Supabase é a action.
 *
 * À PROVA DE FALHA: se a camada TSE vier vazia (gabinete sem candidato
 * vinculado, ou dado ausente), `votos` vem null e a UI esconde a coluna — nunca
 * quebra, nunca inventa número.
 */

export type LeituraVoto = "fortaleza" | "oportunidade" | "acompanhar";

/** Um destino (município ou bairro) com o quanto foi investido ali. */
export interface DestinoComValor {
  /** chave canônica de cruzamento (ibge do município OU bairro normalizado). */
  chave: string;
  rotulo: string;
  valorIndicadoCents: number;
}

/** Votos do parlamentar num destino (opcionalmente com o total válido p/ o %). */
export interface VotoNoDestino {
  chave: string;
  votos: number;
  /** total de votos válidos no destino — presente p/ deputado (município), ausente p/ bairro. */
  total?: number | null;
}

export interface CruzamentoEmendaVoto {
  chave: string;
  rotulo: string;
  valorIndicadoCents: number;
  /** null = sem dado TSE para este destino. */
  votos: number | null;
  /** votos / total * 100, arredondado a 1 casa; null se não há total. */
  pctVotos: number | null;
  leitura: LeituraVoto | null;
}

export interface ResumoEmendaVoto {
  temDados: boolean;
  /** valor investido em destinos de OPORTUNIDADE (pouco voto). */
  valorOportunidadeCents: number;
  /** valor investido em FORTALEZA (muito voto). */
  valorFortalezaCents: number;
  nOportunidade: number;
  nFortaleza: number;
}

/** minúsculo, sem acento, espaços colapsados — p/ casar nomes de bairro. */
export function normalizarChave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cruza destinos (com valor) × votos. Fail-soft: destino sem voto conhecido sai
 * com votos=null/leitura=null. A leitura (fortaleza/oportunidade) usa os terços
 * dos votos ENTRE os destinos que têm voto > 0 — robusto a escala.
 */
export function cruzarEmendaVoto(destinos: DestinoComValor[], votos: VotoNoDestino[]): CruzamentoEmendaVoto[] {
  const mapaVotos = new Map<string, VotoNoDestino>();
  for (const v of votos) mapaVotos.set(v.chave, v);

  // Terços dos votos entre destinos COM voto, p/ classificar fortaleza/oportunidade.
  const votosPresentes = destinos
    .map((d) => mapaVotos.get(d.chave)?.votos ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const quantil = (frac: number) =>
    votosPresentes.length ? votosPresentes[Math.floor((votosPresentes.length - 1) * frac)] ?? 0 : 0;
  const baixo = quantil(0.34);
  const alto = quantil(0.66);

  const out = destinos.map((d) => {
    const v = mapaVotos.get(d.chave);
    const votosN = v ? v.votos : null;
    const total = v?.total ?? null;
    const pct = votosN != null && total && total > 0 ? Math.round((votosN / total) * 1000) / 10 : null;
    let leitura: LeituraVoto | null = null;
    if (votosN != null) {
      // Só classifica quando há dispersão real (há destinos com voto > 0).
      if (votosPresentes.length > 0) {
        leitura = votosN <= baixo ? "oportunidade" : votosN >= alto ? "fortaleza" : "acompanhar";
      } else {
        leitura = "oportunidade";
      }
    }
    return { chave: d.chave, rotulo: d.rotulo, valorIndicadoCents: d.valorIndicadoCents, votos: votosN, pctVotos: pct, leitura };
  });

  // Mais investido primeiro (é a leitura que o gabinete quer bater o olho).
  return out.sort((a, b) => b.valorIndicadoCents - a.valorIndicadoCents);
}

/** Há ao menos um destino com voto conhecido? (a UI usa p/ mostrar/esconder a coluna) */
export function temDadosDeVoto(cruzamento: CruzamentoEmendaVoto[]): boolean {
  return cruzamento.some((c) => c.votos != null);
}

/** Resumo "onde investi × onde votei" — quanto foi p/ oportunidade vs fortaleza. */
export function resumoInvestimentoVsVoto(cruzamento: CruzamentoEmendaVoto[]): ResumoEmendaVoto {
  let valorOportunidadeCents = 0;
  let valorFortalezaCents = 0;
  let nOportunidade = 0;
  let nFortaleza = 0;
  for (const c of cruzamento) {
    if (c.leitura === "oportunidade") {
      valorOportunidadeCents += c.valorIndicadoCents;
      nOportunidade += 1;
    } else if (c.leitura === "fortaleza") {
      valorFortalezaCents += c.valorIndicadoCents;
      nFortaleza += 1;
    }
  }
  return {
    temDados: temDadosDeVoto(cruzamento),
    valorOportunidadeCents,
    valorFortalezaCents,
    nOportunidade,
    nFortaleza,
  };
}

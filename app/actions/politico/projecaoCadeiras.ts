"use server";

/**
 * Projeção de Cadeiras (Quociente Eleitoral/Partidário). Simulador para eleições
 * PROPORCIONAIS (vereador, dep. estadual, dep. federal): a partir dos votos
 * NOMINAIS do último pleito, projeta QE, QP e distribuição de sobras (regra
 * 80%/20% vigente). É uma APROXIMAÇÃO — a base nominal não inclui votos de
 * legenda (não ingeridos) nem agrupa federações; serve para planejar "quantos
 * votos preciso". O cálculo roda no cliente (simulador instantâneo); aqui só
 * buscamos os candidatos e o nº real de cadeiras do pleito.
 */

import { rankingCandidatos, rankingCandidatosMun } from "@/app/actions/politico/raioX";

export interface CandidatoCadeira {
  sq: string;
  nome: string;
  nr: string;
  partido: string;
  votos: number;
  eleitoReal: boolean; // foi eleito de verdade naquele pleito (TSE)
}

export interface DadosCadeiras {
  escopo: string;         // rótulo (município ou "MG")
  cadeiras: number;       // nº de eleitos no pleito (= cadeiras em disputa)
  candidatos: CandidatoCadeira[];
}

function eleito(situacao: string | null): boolean {
  if (!situacao) return false;
  const s = situacao.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return s.startsWith("eleito"); // "Eleito", "Eleito por QP", "Eleito por media" — exclui "nao eleito"
}

export async function dadosCadeiras(electionId: number, municipioTse: string | null, escopoNome: string): Promise<DadosCadeiras> {
  const brutos = municipioTse
    ? await rankingCandidatosMun(electionId, municipioTse, "", 4000, 0)
    : await rankingCandidatos(electionId, "", 4000, 0);

  const candidatos: CandidatoCadeira[] = brutos
    .filter((c) => c.votos > 0 && c.partido)
    .map((c) => ({ sq: c.sq, nome: c.nomeUrna || c.nome, nr: c.nr, partido: c.partido as string, votos: c.votos, eleitoReal: eleito(c.situacao) }));

  const cadeiras = candidatos.filter((c) => c.eleitoReal).length;
  return { escopo: escopoNome, cadeiras, candidatos };
}

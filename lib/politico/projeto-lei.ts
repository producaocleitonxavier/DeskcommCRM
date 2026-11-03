/**
 * Regras puras dos Projetos de Lei — agrupamento de situação (os 11 status viram
 * 5 grupos que o gabinete entende) e leitura de autoria. Sem efeito colateral,
 * sem imports de supabase/next. Alimenta KPIs, filtros e selos da tela.
 */

export type GrupoSituacao = "tramitacao" | "comissoes" | "votacao" | "virou_lei" | "encerrado";

/**
 * Converte o status oficial (11 estados) no GRUPO que o gabinete lê de bate-olho.
 * `promulgado` é a vitória (virou_lei); comissões e plenário/votação separados;
 * vetado/arquivado/retirado = encerrado; o resto é tramitação.
 */
export function grupoSituacao(status: string): GrupoSituacao {
  switch (status) {
    case "promulgado":
      return "virou_lei";
    case "em_comissao":
    case "aprovado_comissao":
      return "comissoes";
    case "em_plenario":
    case "aprovado":
      return "votacao";
    case "vetado":
    case "arquivado":
    case "retirado":
      return "encerrado";
    default:
      // rascunho, apresentado, em_tramitacao
      return "tramitacao";
  }
}

/** Grupos na ordem do funil legislativo — rótulos dos chips de filtro. */
export const GRUPOS_SITUACAO: { grupo: GrupoSituacao; label: string }[] = [
  { grupo: "tramitacao", label: "Em tramitação" },
  { grupo: "comissoes", label: "Nas comissões" },
  { grupo: "votacao", label: "Pronto p/ votação" },
  { grupo: "virou_lei", label: "Virou Lei" },
  { grupo: "encerrado", label: "Arquivado" },
];

/** Tem coautor de verdade? (lista com ao menos um nome não-vazio) → coautoria. */
export function autoriaEhColetiva(coautores: string[] | null | undefined): boolean {
  return Array.isArray(coautores) && coautores.some((c) => (c ?? "").trim().length > 0);
}

/** Rótulo curto de autoria. */
export function autoriaLabel(coautores: string[] | null | undefined): "Coautoria" | "Autoria única" {
  return autoriaEhColetiva(coautores) ? "Coautoria" : "Autoria única";
}

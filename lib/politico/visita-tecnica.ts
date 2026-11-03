/**
 * VISITA TÉCNICA — regra pura. A demanda pode ter uma visita MARCADA (data em
 * `prazo_em`) e um registro de que ela foi FEITA (`pol_visita_realizada_em`).
 * Aqui mora só a leitura de "está pendente?": a visita passou do dia marcado e
 * ninguém foi. Sem efeito colateral, sem imports de supabase/next.
 */

/** Estados em que a demanda já saiu da mesa — visita não cobra mais. */
const ESTADOS_FECHADOS = new Set(["resolvida", "encerrada"]);

export interface VisitaDemanda {
  /** Data/hora da visita MARCADA (demandas.prazo_em). */
  visitaEm: string | null;
  /** Data em que a visita foi REALIZADA (null = não feita). */
  realizadaEm: string | null;
  estado: string;
  /** Quem vai na visita (assessor). null/"" = ninguém marcou. Opcional. */
  responsavelId?: string | null;
}

/**
 * Visita MARCADA e NÃO FEITA: tem dia marcado, o dia já passou, não foi
 * realizada, e a demanda ainda está na mesa. É o "esqueci de ir". Nunca lança.
 */
export function visitaPendente(d: VisitaDemanda): boolean {
  if (!d.visitaEm) return false;
  if (d.realizadaEm) return false;
  if (ESTADOS_FECHADOS.has(d.estado)) return false;
  const t = Date.parse(d.visitaEm);
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

/**
 * Visita PENDENTE e SEM responsável marcado — o pior caso: passou do dia, não
 * foi feita, e ninguém assumiu. É o que o selo da lista destaca mais forte.
 */
export function visitaSemResponsavel(d: VisitaDemanda): boolean {
  if (!visitaPendente(d)) return false;
  return !(d.responsavelId ?? "").trim();
}

/** Tem visita marcada no FUTURO (ainda não chegou o dia), não realizada, aberta. */
export function visitaAgendada(d: VisitaDemanda): boolean {
  if (!d.visitaEm || d.realizadaEm) return false;
  if (ESTADOS_FECHADOS.has(d.estado)) return false;
  const t = Date.parse(d.visitaEm);
  if (Number.isNaN(t)) return false;
  return t >= Date.now();
}

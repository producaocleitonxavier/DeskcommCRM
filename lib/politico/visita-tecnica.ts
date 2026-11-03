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

export type StatusVisita = "realizada" | "atrasada" | "agendada";

/**
 * Bucket da visita para o painel "Visitas Técnicas": realizada vence tudo;
 * depois atrasada (pendente); o resto é agendada (futura ou neutra). É puro.
 */
export function statusVisita(d: VisitaDemanda): StatusVisita {
  if (d.realizadaEm) return "realizada";
  if (visitaPendente(d)) return "atrasada";
  return "agendada";
}

const RANK_VISITA: Record<StatusVisita, number> = { atrasada: 0, agendada: 1, realizada: 2 };

/**
 * Ordenação do painel: ATRASADAS primeiro, depois agendadas, depois realizadas;
 * dentro de cada grupo, a data mais próxima vem antes. Comparador puro (use com
 * [...visitas].sort(ordenarVisitas)).
 */
export function ordenarVisitas(a: VisitaDemanda, b: VisitaDemanda): number {
  const ra = RANK_VISITA[statusVisita(a)];
  const rb = RANK_VISITA[statusVisita(b)];
  if (ra !== rb) return ra - rb;
  const ta = a.visitaEm ? Date.parse(a.visitaEm) : 0;
  const tb = b.visitaEm ? Date.parse(b.visitaEm) : 0;
  return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
}

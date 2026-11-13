/**
 * MENU DO GABINETE — a camada que enxuga o menu lateral do módulo político.
 *
 * O catálogo (`catalogo.ts`) segue sendo a fonte de QUAIS telas existem e de quem
 * pode vê-las (papel, perfil de menu, módulos). Esta camada decide só a
 * APRESENTAÇÃO para um gabinete: quais portas ficam no menu lateral e quais telas
 * irmãs aparecem como ABAS no topo umas das outras.
 *
 * Regras (decisão do dono do produto, 13/nov/2026):
 *  - NENHUMA tela some: tudo que saiu do menu lateral virou aba de uma área ou
 *    seção de Configurações, e continua na busca.
 *  - A camada só FILTRA e REORDENA o que o usuário já enxerga — nunca dá acesso
 *    a nada (quem recusa continua sendo a tela e a rota).
 *  - Varredura de 12/nov: 53 itens no menu lateral, três "Radar", "Funil" × "Funis"
 *    × "Mobilização", "Pessoas" × "Contatos". Aqui ficam 19 portas.
 *
 * Puro (sem React, sem I/O) para ser testável.
 */

export type GrupoDoGabinete = "topo" | "gabinete" | "relacionamento" | "inteligencia";

export interface AbaDaArea {
  href: string;
  label: string;
  /**
   * Tela que não tem entrada própria no catálogo: aparece para quem enxerga
   * ESTA outra (ex.: Prestação de contas acompanha o Painel).
   */
  seVe?: string;
}

export interface AreaDoGabinete {
  /** Nome da porta no menu lateral. */
  label: string;
  grupo: GrupoDoGabinete;
  /** A primeira aba é a tela principal da área. Área de uma tela só tem uma aba. */
  abas: readonly AbaDaArea[];
}

export const ROTULO_DO_GRUPO: Record<GrupoDoGabinete, string> = {
  topo: "Comando",
  gabinete: "Gabinete",
  relacionamento: "Relacionamento",
  inteligencia: "Inteligência",
};

export const ORDEM_DOS_GRUPOS: readonly GrupoDoGabinete[] = ["topo", "gabinete", "relacionamento", "inteligencia"];

const P = "/app/politico";

export const AREAS_DO_GABINETE: readonly AreaDoGabinete[] = [
  // ── Topo: o que se abre todo dia ───────────────────────────────────────────
  {
    label: "Hoje",
    grupo: "topo",
    abas: [
      { href: P, label: "Hoje" },
      { href: `${P}/dashboard`, label: "Painel" },
      { href: `${P}/prestacao-contas`, label: "Prestação de contas", seVe: `${P}/dashboard` },
      { href: "/app/activities", label: "O que a equipe fez" },
    ],
  },
  {
    label: "Conversas",
    grupo: "topo",
    abas: [
      { href: "/app/inbox", label: "Conversas" },
      { href: "/app/ai/cases", label: "Precisa de gente" },
      { href: "/app/radar", label: "Demandas paradas" },
      { href: "/app/templates", label: "Respostas prontas" },
    ],
  },
  {
    label: "Pessoas",
    grupo: "topo",
    abas: [
      { href: `${P}/leads`, label: "Pessoas" },
      { href: "/app/contacts", label: "Contatos" },
      { href: `${P}/grupos-origem`, label: "De onde vieram" },
      { href: `${P}/importar`, label: "Importar lista" },
    ],
  },
  {
    label: "Agenda",
    grupo: "topo",
    abas: [
      { href: "/app/agenda", label: "Agenda" },
      { href: "/app/tasks", label: "Tarefas" },
      { href: `${P}/locais`, label: "Locais & Eventos" },
    ],
  },

  // ── Gabinete: o trabalho do mandato ────────────────────────────────────────
  { label: "Demandas", grupo: "gabinete", abas: [{ href: `${P}/demandas`, label: "Demandas" }] },
  { label: "Visitas Técnicas", grupo: "gabinete", abas: [{ href: `${P}/visitas`, label: "Visitas Técnicas" }] },
  { label: "Ofícios", grupo: "gabinete", abas: [{ href: `${P}/oficios`, label: "Ofícios" }] },
  { label: "Lideranças", grupo: "gabinete", abas: [{ href: `${P}/liderancas`, label: "Lideranças" }] },
  {
    label: "Emendas e Obras",
    grupo: "gabinete",
    abas: [
      { href: `${P}/emendas`, label: "Emendas" },
      { href: `${P}/obras`, label: "Obras & Fiscalização" },
    ],
  },
  { label: "Projetos de Lei", grupo: "gabinete", abas: [{ href: `${P}/projetos-lei`, label: "Projetos de Lei" }] },
  { label: "Materiais", grupo: "gabinete", abas: [{ href: `${P}/materiais`, label: "Materiais" }] },

  // ── Relacionamento: falar com a base ───────────────────────────────────────
  {
    label: "Mensagens automáticas",
    grupo: "relacionamento",
    abas: [
      { href: `${P}/nutricao`, label: "Todo mês" },
      { href: `${P}/follow-up-simples`, label: "Por objetivo" },
      { href: "/app/ai/followups", label: "Todos os fluxos" },
    ],
  },
  { label: "Envio em massa", grupo: "relacionamento", abas: [{ href: "/app/campaigns", label: "Envio em massa" }] },
  {
    label: "Captação",
    grupo: "relacionamento",
    abas: [
      { href: "/app/captacao-qr", label: "Por QR" },
      // A tela do Instagram exige administrador: a aba só aparece para quem pode abri-la.
      { href: "/app/instagram", label: "Pelo Instagram", seVe: "/app/instagram/conectar" },
    ],
  },
  {
    label: "Mobilização",
    grupo: "relacionamento",
    abas: [
      { href: `${P}/kanban`, label: "Mobilização" },
      { href: `${P}/multiplicadores`, label: "Multiplicadores" },
      { href: `${P}/funil`, label: "Funil" },
    ],
  },
  { label: "Pesquisas", grupo: "relacionamento", abas: [{ href: `${P}/pesquisas`, label: "Pesquisas" }] },

  // ── Inteligência: ler o cenário ────────────────────────────────────────────
  {
    label: "Votos e território",
    grupo: "inteligencia",
    abas: [
      { href: `${P}/raio-x`, label: "Raio-X" },
      { href: `${P}/radar-zonal`, label: "Por zona" },
      { href: `${P}/comparativo`, label: "Comparar" },
      { href: `${P}/cadeiras`, label: "Cadeiras" },
      { href: `${P}/mapa-eleitoral`, label: "Mapa" },
    ],
  },
  {
    label: "Estratégia",
    grupo: "inteligencia",
    abas: [
      { href: `${P}/boletim`, label: "Boletim" },
      { href: `${P}/briefing`, label: "Dossiê" },
      { href: `${P}/narrativas`, label: "Narrativas" },
    ],
  },
  { label: "Imprensa", grupo: "inteligencia", abas: [{ href: `${P}/social`, label: "Imprensa" }] },
];

/** O endereço casa com a tela `href` (ela mesma ou uma tela filha)? */
function casa(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Este usuário é de um gabinete político? (enxerga a tela Hoje do mandato) */
export function ehGabinete(visiveis: ReadonlySet<string>): boolean {
  return visiveis.has(P);
}

export interface PortaDoGabinete {
  /** Para onde a porta leva: a primeira aba que o usuário enxerga. */
  href: string;
  label: string;
  grupo: GrupoDoGabinete;
  /** As abas que ESTE usuário enxerga (0 ou 1 = a tela não mostra barra de abas). */
  abas: AbaDaArea[];
}

/**
 * As portas do menu lateral para quem enxerga `visiveis`. Área sem nenhuma aba
 * visível some. Com uma aba só visível que não é a principal, a porta leva o
 * nome DAQUELA tela (o assessor de rua vê "Obras & Fiscalização", não "Emendas
 * e Obras").
 */
export function portasDoGabinete(visiveis: ReadonlySet<string>): PortaDoGabinete[] {
  const portas: PortaDoGabinete[] = [];
  for (const area of AREAS_DO_GABINETE) {
    const abas = area.abas.filter((a) => visiveis.has(a.seVe ?? a.href));
    const primeira = abas[0];
    if (!primeira) continue;
    const soUmaEQueNaoEAPrincipal = abas.length === 1 && primeira.href !== area.abas[0]!.href;
    portas.push({
      href: primeira.href,
      label: soUmaEQueNaoEAPrincipal ? primeira.label : area.label,
      grupo: area.grupo,
      abas,
    });
  }
  return portas;
}

/**
 * A porta "dona" da tela atual: a que tem a aba de endereço mais específico que
 * casa com `pathname`. É ela que fica acesa no menu — inclusive quando a pessoa
 * está numa aba que não é a principal (ex.: em "Respostas prontas", acende
 * "Conversas"). `null` = a tela não pertence a nenhuma área.
 */
export function portaDaTela(pathname: string, portas: readonly PortaDoGabinete[]): { porta: PortaDoGabinete; aba: AbaDaArea } | null {
  let melhor: { porta: PortaDoGabinete; aba: AbaDaArea } | null = null;
  for (const porta of portas) {
    for (const aba of porta.abas) {
      // "Hoje" é a raiz de todas as telas do mandato: só casa com ela mesma.
      const ok = aba.href === P ? pathname === P : casa(pathname, aba.href);
      if (ok && (!melhor || aba.href.length > melhor.aba.href.length)) melhor = { porta, aba };
    }
  }
  return melhor;
}

/** Todos os endereços que esta camada cobre (para os testes de "nada se perde"). */
export function enderecosCobertos(): string[] {
  return AREAS_DO_GABINETE.flatMap((a) => a.abas.map((x) => x.href));
}

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { type Role } from "@/lib/auth/types";
import {
  Bell,
  BookOpen,
  Brain,
  Buildings,
  CalendarBlank,
  ChartBar,
  ChartLineUp,
  ClipboardText,
  Newspaper,
  ClockCountdown,
  ClockCounterClockwise,
  FileText,
  Flag,
  FlowArrow,
  Funnel,
  Gauge,
  Inbox,
  Kanban,
  Key,
  Lightbulb,
  ListChecks,
  Lock,
  Megaphone,
  Microphone,
  Palette,
  PaperPlaneTilt,
  Phone,
  Plugs,
  PlugsConnected,
  PuzzlePiece,
  Receipt,
  Robot,
  ScalesSimple,
  ShieldCheck,
  Signpost,
  Storefront,
  Tag,
  UserCircle,
  Users,
  UsersThree,
  InstagramLogo,
  WebhooksLogo,
  // Módulo político — War Room 2.0 (Prompt 6)
  GitBranch,
  ShareNetwork,
  Globe,
  ChatsCircle,
  Eye,
  MapPin,
  MagnifyingGlass,
  Trophy,
  Stack,
  Crown,
  CurrencyDollar,
  IdentificationCard,
  QrCode,
} from "@/lib/ui/icons";

import {
  NAV_CATALOG,
  NAV_GROUPS,
  type NavMetadata,
  type NavGroup,
  type NavGroupId,
  sobeAoMenuLateral,
} from "./catalogo";
import type { ModuloOpcional } from "@/lib/instalacao/modulos";
import type { CapacidadeDaOrganizacao } from "@/lib/organizacao/capacidades";

import { destinosDaInterface, type InterfaceSettings } from "./interface";
import { GRUPO_NO_RODAPE as RODAPE } from "./catalogo";
import { ORDEM_DOS_GRUPOS, ROTULO_DO_GRUPO, ehGabinete, portasDoGabinete, type GrupoDoGabinete, type PortaDoGabinete } from "./menu-do-gabinete";

/** Em qual grupo do catálogo cada bloco do menu do gabinete se apoia (só o id; o rótulo é o da camada). */
const GRUPO_BASE: Record<GrupoDoGabinete, NavGroupId> = {
  topo: "comando",
  gabinete: "gabinete",
  relacionamento: "engajamento",
  inteligencia: "inteligencia",
};
export { NAV_GROUPS, GRUPO_NO_RODAPE } from "./catalogo";
export type { NavGroup, NavGroupId } from "./catalogo";
const ICONS = {
  Bell,
  BookOpen,
  Brain,
  Buildings,
  CalendarBlank,
  ChartBar,
  ChartLineUp,
  ClipboardText,
  Newspaper,
  ClockCountdown,
  ClockCounterClockwise,
  FileText,
  Flag,
  FlowArrow,
  Funnel,
  Gauge,
  Inbox,
  InstagramLogo,
  Kanban,
  Key,
  Lightbulb,
  ListChecks,
  Lock,
  Megaphone,
  Microphone,
  Palette,
  PaperPlaneTilt,
  Phone,
  Plugs,
  PlugsConnected,
  PuzzlePiece,
  Receipt,
  Robot,
  ScalesSimple,
  ShieldCheck,
  Signpost,
  Storefront,
  Tag,
  UserCircle,
  Users,
  UsersThree,
  WebhooksLogo,
  // Módulo político — War Room 2.0 (Prompt 6)
  GitBranch,
  ShareNetwork,
  Globe,
  ChatsCircle,
  Eye,
  MapPin,
  MagnifyingGlass,
  Trophy,
  Stack,
  Crown,
  CurrencyDollar,
  IdentificationCard,
  QrCode,
};
export interface NavDestination extends Omit<NavMetadata, "icon"> {
  icon: PhosphorIcon;
}
export const NAV_DESTINATIONS: NavDestination[] = NAV_CATALOG.map((d) => ({
  ...d,
  icon: ICONS[d.icon],
}));
/**
 * Único ponto de decisão de permissão da navegação.
 *
 * É o que dispensa os sete `usePermission()` que o Sidebar chamava em sequência
 * — hooks não rodam em laço condicional, então cada permissão exigia sua linha.
 * Como função pura, um `.filter()` resolve todas.
 */
export { canSee } from "./interface";

/** Projeção do sidebar: só o uso diário, agrupado, sem grupo vazio. */
export function sidebarGroups(
  isPlatformAdmin: boolean,
  role: Role | null,
  settings?: InterfaceSettings,
  modulos?: readonly ModuloOpcional[],
  capacidades?: readonly CapacidadeDaOrganizacao[],
): Array<{ group: NavGroup; items: NavDestination[] }> {
  const visible = new Set<string>(
    destinosDaInterface(settings, isPlatformAdmin, role, modulos, capacidades).map((d) => d.href),
  );
  return NAV_GROUPS.map((group) => ({
    group,
    items: NAV_DESTINATIONS.filter(
      (d) =>
        d.group === group.id &&
        sobeAoMenuLateral(d, !!settings?.destinos) &&
        visible.has(d.href),
    ),
  })).filter(
    (g) =>
      g.items.length > 0 ||
      (g.group.hub && NAV_DESTINATIONS.some((d) => d.group === g.group.id && visible.has(d.href))),
  );
}

/**
 * Projeção do hub: TODAS as telas do grupo — inclusive as que já estão no
 * sidebar. O hub é inventário, não sobra; é onde se descobre o que existe.
 *
 * A ordem das seções é a de primeira aparição no registro, então reordenar a
 * jornada é reordenar o array — não há uma segunda lista para manter em sincronia.
 */
/**
 * O MENU LATERAL que a casca desenha.
 *
 * Num gabinete político é o da camada `menu-do-gabinete`: 19 portas em vez de 53,
 * com as telas irmãs em abas. Fora dele, é `sidebarGroups()`, intocado — o menu
 * do sistema base segue com os testes e o comportamento de sempre. A camada só
 * reordena o que o usuário já enxerga; nenhuma tela ganha acesso por aqui.
 */
export function menuLateral(
  isPlatformAdmin: boolean,
  role: Role | null,
  settings?: InterfaceSettings,
  modulos?: readonly ModuloOpcional[],
  capacidades?: readonly CapacidadeDaOrganizacao[],
): Array<{ group: NavGroup; items: NavDestination[] }> {
  const visible = new Set<string>(
    destinosDaInterface(settings, isPlatformAdmin, role, modulos, capacidades).map((d) => d.href),
  );
  if (!ehGabinete(visible)) return sidebarGroups(isPlatformAdmin, role, settings, modulos, capacidades);

  const porHref = new Map(NAV_DESTINATIONS.map((d) => [d.href, d]));
  const portas = portasDoGabinete(visible);
  const grupos: Array<{ group: NavGroup; items: NavDestination[] }> = [];
  for (const g of ORDEM_DOS_GRUPOS) {
    const items: NavDestination[] = [];
    for (const porta of portas) {
      if (porta.grupo !== g) continue;
      const base = porHref.get(porta.href);
      if (base) items.push({ ...base, label: porta.label, group: GRUPO_BASE[g] });
    }
    if (items.length > 0) grupos.push({ group: { id: GRUPO_BASE[g], label: ROTULO_DO_GRUPO[g] }, items });
  }
  const rodape = NAV_GROUPS.find((x) => x.id === RODAPE);
  if (rodape && NAV_DESTINATIONS.some((d) => d.group === rodape.id && visible.has(d.href))) {
    grupos.push({ group: rodape, items: [] });
  }
  return grupos;
}

/**
 * As portas do menu do gabinete para ESTE usuário (com as abas que ele enxerga),
 * ou `null` quando a organização não é um gabinete político. É o que o menu
 * lateral e a barra de abas usam para saber "de qual área é esta tela".
 */
export function portasDoUsuario(
  isPlatformAdmin: boolean,
  role: Role | null,
  settings?: InterfaceSettings,
  modulos?: readonly ModuloOpcional[],
  capacidades?: readonly CapacidadeDaOrganizacao[],
): PortaDoGabinete[] | null {
  const visible = new Set<string>(
    destinosDaInterface(settings, isPlatformAdmin, role, modulos, capacidades).map((d) => d.href),
  );
  return ehGabinete(visible) ? portasDoGabinete(visible) : null;
}

export function hubSections(
  group: NavGroupId,
  isPlatformAdmin: boolean,
  role: Role | null,
  settings?: InterfaceSettings,
  modulos?: readonly ModuloOpcional[],
  capacidades?: readonly CapacidadeDaOrganizacao[],
): Array<{ section: string; items: NavDestination[] }> {
  const porSecao = new Map<string, NavDestination[]>();
  const visible = new Set<string>(
    destinosDaInterface(settings, isPlatformAdmin, role, modulos, capacidades).map((d) => d.href),
  );
  for (const d of NAV_DESTINATIONS) {
    if (d.group !== group || !visible.has(d.href) || d.hubOculto) continue;
    const secao = d.section ?? "";
    const atual = porSecao.get(secao);
    if (atual) atual.push(d);
    else porSecao.set(secao, [d]);
  }
  return [...porSecao.entries()].map(([section, items]) => ({ section, items }));
}

/** Projeção do ⌘K: todo destino visível, do sidebar ou não. */
export function searchable(
  isPlatformAdmin: boolean,
  role: Role | null,
  settings?: InterfaceSettings,
  modulos?: readonly ModuloOpcional[],
  capacidades?: readonly CapacidadeDaOrganizacao[],
): NavDestination[] {
  const visible = new Set<string>(
    destinosDaInterface(settings, isPlatformAdmin, role, modulos, capacidades).map((d) => d.href),
  );
  return NAV_DESTINATIONS.filter((d) => visible.has(d.href));
}

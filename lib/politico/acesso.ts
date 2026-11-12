/**
 * PAREDE DE ACESSO do módulo político — a regra ÚNICA de quem entra em cada tela.
 *
 * Por que existe: o menu (perfis "Assessor de rua" / "Assessor de gabinete") é
 * só APRESENTAÇÃO — esconde o item, mas a tela abria para qualquer membro que
 * digitasse o endereço. A RLS isola ORGANIZAÇÕES, não papéis; então a trava de
 * papel/perfil tem de estar na própria tela. Aqui mora a regra; cada `page.tsx`
 * chama `exigirAcessoPolitico("<módulo>")` na primeira linha.
 *
 * DUAS camadas, nesta ordem:
 *  1. PAPEL mínimo do módulo (viewer < agent < manager < admin).
 *  2. PERFIL: quem está ABAIXO de gestor só entra se a porta do módulo está no
 *     menu dele (`destinosDaInterface` — a mesma lista que monta o sidebar). É o
 *     que separa "rua" de "gabinete", que têm o MESMO papel (agent).
 *     Gestor/admin NÃO passam por esta camada: um menu personalizado antigo não
 *     pode trancar o gestor fora de uma tela nova (o papel já o autoriza).
 *
 * Administrador da plataforma (fora de suporte/impersonation) passa sempre.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { destinosDaInterface } from "@/lib/navigation/interface";

interface RegraDeAcesso {
  /** Papel mínimo para a tela existir para a pessoa. */
  min: Role;
  /** Porta de menu que precisa estar no perfil de quem está abaixo de gestor. */
  destino?: string;
}

export const REGRAS_DE_ACESSO_POLITICO = {
  // Dia-a-dia (rua e gabinete) — papel agent + porta no perfil.
  hoje: { min: "agent", destino: "/app/politico" },
  pessoas: { min: "agent", destino: "/app/politico/leads" },
  demandas: { min: "agent", destino: "/app/politico/demandas" },
  visitas: { min: "agent", destino: "/app/politico/visitas" },
  obras: { min: "agent", destino: "/app/politico/obras" },
  locais: { min: "agent", destino: "/app/politico/locais" },
  // Captura de campo "10s": nasce demanda — vale a mesma porta.
  campo: { min: "agent", destino: "/app/politico/demandas" },
  // Vitórias (antes & depois) parte de uma demanda resolvida.
  vitorias: { min: "agent", destino: "/app/politico/demandas" },
  // Só gabinete (não está no perfil de rua).
  oficios: { min: "agent", destino: "/app/politico/oficios" },
  liderancas: { min: "agent", destino: "/app/politico/liderancas" },
  "projetos-lei": { min: "agent", destino: "/app/politico/projetos-lei" },
  emendas: { min: "agent", destino: "/app/politico/emendas" },
  // Operação — fora dos perfis rua/gabinete; agente de menu completo ainda entra.
  funil: { min: "agent", destino: "/app/politico/funil" },
  kanban: { min: "agent", destino: "/app/politico/kanban" },
  multiplicadores: { min: "agent", destino: "/app/politico/multiplicadores" },
  "grupos-origem": { min: "agent", destino: "/app/politico/grupos-origem" },
  // Gestão — base inteira, conteúdo, identidade e IA do mandato.
  importar: { min: "manager" },
  materiais: { min: "manager" },
  eventos: { min: "manager" },
  rankings: { min: "manager" },
  identidade: { min: "manager" },
  enriquecer: { min: "manager" },
  "follow-up-simples": { min: "manager" },
} as const satisfies Record<string, RegraDeAcesso>;

export type ModuloPolitico = keyof typeof REGRAS_DE_ACESSO_POLITICO;

export type DecisaoDeAcesso = "ok" | "sem_papel" | "fora_do_perfil";

/**
 * A decisão PURA (testável): dado papel + portas visíveis no menu da pessoa,
 * entra ou não. `portasDoMenu` só é consultado abaixo de gestor.
 */
export function decidirAcessoPolitico(
  modulo: ModuloPolitico,
  papel: Role,
  portasDoMenu: ReadonlySet<string>,
  ehPlataforma = false,
): DecisaoDeAcesso {
  if (ehPlataforma) return "ok";
  const regra: RegraDeAcesso = REGRAS_DE_ACESSO_POLITICO[modulo];
  if (ROLE_RANK[papel] < ROLE_RANK[regra.min]) return "sem_papel";
  if (regra.destino && ROLE_RANK[papel] < ROLE_RANK.manager && !portasDoMenu.has(regra.destino)) {
    return "fora_do_perfil";
  }
  return "ok";
}

/**
 * Guard de Server Component: redireciona quem não pode ver o módulo. Chamar na
 * PRIMEIRA linha da página (antes de qualquer leitura de dados).
 */
export async function exigirAcessoPolitico(modulo: ModuloPolitico): Promise<void> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  const ehPlataforma = !!user.is_platform_admin && !user.support;
  const portas = new Set(
    destinosDaInterface(org.interface_settings, ehPlataforma, org.role).map((d) => d.href),
  );
  const decisao = decidirAcessoPolitico(modulo, org.role, portas, ehPlataforma);
  if (decisao === "ok") return;
  // Fora do perfil: volta para o "Hoje" se ele próprio é permitido; senão, /app.
  if (decisao === "fora_do_perfil" && modulo !== "hoje" && portas.has("/app/politico")) {
    redirect("/app/politico");
  }
  redirect("/app");
}

/**
 * Para SERVER ACTIONS do módulo político: o mesmo que `requireAuth()`, mas só
 * devolve o usuário se o papel dele na org ativa é >= `min`. Fecha a brecha de a
 * ação ser chamada direto (sem a tela) por quem o papel não permite. Sem org
 * ativa, devolve o usuário e deixa a ação tratar (ela já trata esse caso).
 *
 * Aqui a régua é só o PAPEL (não o perfil de menu): várias ações são usadas por
 * mais de uma tela, e travar por porta de menu quebraria fluxos legítimos.
 */
export async function autenticarComPapel(min: Role): Promise<Awaited<ReturnType<typeof requireAuth>>> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  const ehPlataforma = !!user.is_platform_admin && !user.support;
  if (org && !ehPlataforma && ROLE_RANK[org.role] < ROLE_RANK[min]) redirect("/app");
  return user;
}

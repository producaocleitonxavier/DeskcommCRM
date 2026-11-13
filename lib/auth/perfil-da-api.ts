/**
 * O PERFIL DE MENU TAMBÉM VALE NAS CONSULTAS AO SERVIDOR.
 *
 * O perfil ("Assessor de rua", "Assessor de gabinete") estreita o que a pessoa vê
 * no menu, e as telas já recusam quem digita o endereço (`lib/politico/acesso.ts`).
 * Faltava a porta de trás: as rotas `/api/v1/*` só olhavam o PAPEL. Um assessor de
 * rua (papel atendente) que chamasse `/api/v1/contacts` direto recebia a base
 * inteira, mesmo sem a tela de Contatos no perfil dele.
 *
 * Regra: abaixo de gestor E com perfil restrito (lista de portas definida no
 * vínculo), cada ÁREA da API só responde se a pessoa tem ao menos uma das portas
 * que usam aquela área. Gestor para cima e quem tem o menu completo não mudam.
 * Área que não está no mapa não é barrada aqui (utilitários de toda tela: sessão,
 * versão, presença, agenda) — o papel continua valendo nelas.
 *
 * Medido em 13/nov/2026 com a conta de assessor de rua na homologação: ao ABRIR as
 * telas do perfil dele só saem `agenda/*`, `auth/*`, `system/*`, `tags/cores`,
 * `voice/calls` e `attendants/presence`. Ao SALVAR uma pessoa sai `contacts`
 * (por isso "Pessoas" é porta de `contacts`).
 *
 * LIMITE CONHECIDO: isto fecha as rotas do sistema. Quem extrair o token da própria
 * sessão ainda consulta o banco direto, onde a regra é só por organização. Fechar
 * isso é levar o perfil para as regras do banco — decisão registrada, não feita aqui.
 *
 * Puro (sem I/O) para ser testável. Quem aplica é `requireRole`.
 */
import { ROLE_RANK, type Role } from "@/lib/auth/types";

const INBOX = "/app/inbox";
const CONTATOS = "/app/contacts";
const P = "/app/politico";

/** Área da API (1º trecho depois de `/api/v1/`) → portas que dão direito a ela. */
export const PORTAS_DA_AREA_DA_API: Readonly<Record<string, readonly string[]>> = {
  // A base de pessoas do sistema: quem atende conversas também abre a ficha.
  // "Pessoas" do gabinete cadastra e edita o contato por aqui; o cartão do quadro também.
  contacts: [CONTATOS, INBOX, `${P}/leads`, "/app/kanban"],
  "contact-tags": [CONTATOS, INBOX, `${P}/leads`],
  people: [CONTATOS, INBOX, "/app/people"],
  companies: [CONTATOS, INBOX, "/app/companies"],
  "company-people": [CONTATOS, INBOX, "/app/people", "/app/companies"],
  imports: [CONTATOS, `${P}/importar`],
  "lead-captures": [CONTATOS],
  // Conversas e mensagens.
  conversations: [INBOX],
  messages: [INBOX],
  "conversation-tags": [INBOX],
  "message-templates": [INBOX, "/app/templates"],
  // Envio em massa.
  campaigns: ["/app/campaigns"],
  "campaign-templates": ["/app/campaigns"],
  "campaign-suppressions": ["/app/campaigns"],
  // Quadros, etapas e o que é do sistema comercial.
  leads: ["/app/kanban", INBOX, CONTATOS],
  pipelines: ["/app/kanban", INBOX, CONTATOS],
  proposals: ["/app/kanban", "/app/proposals", "/app/faturamento", "/app/comandas"],
  products: ["/app/kanban", "/app/products", "/app/proposals", "/app/faturamento", "/app/comandas"],
  financeiro: ["/app/faturamento", "/app/comandas", "/app/settings/tenant/financeiro"],
  honorarios: ["/app/faturamento", "/app/comandas"],
  prospecting: ["/app/kanban"],
  tasks: ["/app/tasks", INBOX, CONTATOS],
  // Números e relatórios da operação.
  reports: ["/app/metrics", "/app/activities", `${P}/dashboard`],
  metrics: ["/app/metrics", "/app/activities", `${P}/dashboard`],
  // Assistente de IA e casos que pedem gente.
  ai: ["/app/ai/cases", "/app/ai/agents", "/app/ai/followups", INBOX],
  // Módulo político.
  "pol-leads": [`${P}/leads`],
  "pol-liderancas": [`${P}/liderancas`],
  "pol-emendas": [`${P}/emendas`],
  "pol-projetos-lei": [`${P}/projetos-lei`],
  "pol-surveys": [`${P}/pesquisas`],
  "pol-invisible-funnel": [`${P}/funil-invisivel`, `${P}/funil`],
  "pol-opponents": [`${P}/adversarios`, `${P}/social`],
  "pol-narratives": [`${P}/narrativas`],
  "pol-social-profiles": [`${P}/social`],
  // Quem atende conversas encerra a demanda pelo painel lateral.
  demandas: [`${P}/demandas`, `${P}/visitas`, INBOX],
  "pol-call-queue": [`${P}/ligacoes`, `${P}/dashboard`],
  "pol-alerts": [`${P}/alertas`, `${P}/dashboard`],
  "pol-events": [`${P}/eventos`, `${P}/locais`],
  "pol-territories": [`${P}/territorios`, `${P}/raio-x`],
  "pol-content-generator": [`${P}/motor-viral`, `${P}/social`],
  // Instagram e integrações: segredo de quem configura.
  "ig-webhook-tokens": ["/app/instagram", "/app/instagram/conectar"],
  "ig-automation-flows": ["/app/instagram", "/app/instagram/conectar"],
  "external-db": ["/app/integracao-dados"],
};

/** Código do 403 de perfil — diferente do de papel, para a tela saber explicar. */
export const CODIGO_FORA_DO_PERFIL = "forbidden_profile";

export type DecisaoDaApi = "ok" | "fora_do_perfil";

/** A área de uma rota `/api/v1/<área>/...`; `null` se o endereço não é da API. */
export function areaDaApi(pathname: string): string | null {
  // Decodifica antes de ler a área: "/api/v1/%63ontacts" é a rota "contacts".
  let caminho = pathname;
  try {
    caminho = decodeURIComponent(pathname);
  } catch {
    // Caminho malformado não casa com rota nenhuma; segue como veio.
  }
  const m = /^\/api\/v1\/([^/?#]+)/.exec(caminho);
  return m ? m[1]!.toLowerCase() : null;
}

export function decidirApiDoPerfil(
  pathname: string | null,
  papel: Role,
  perfilRestrito: boolean,
  portasDoMenu: ReadonlySet<string>,
  /** Rota que não segue o mapa por área (ex.: `/api/v1/politico/...`): as portas dela. */
  portasExigidas?: readonly string[],
): DecisaoDaApi {
  if (!perfilRestrito) return "ok";
  if (ROLE_RANK[papel] >= ROLE_RANK.manager) return "ok";
  // Sem endereço não há como saber a área: para perfil restrito, falha fechado.
  if (portasExigidas) return portasExigidas.some((p) => portasDoMenu.has(p)) ? "ok" : "fora_do_perfil";
  if (pathname === null) return "fora_do_perfil";
  const area = areaDaApi(pathname);
  // Fora da API (ação de tela, página): quem decide é a trava da própria tela.
  if (area === null) return "ok";
  const portas = PORTAS_DA_AREA_DA_API[area];
  if (!portas) return "ok";
  return portas.some((p) => portasDoMenu.has(p)) ? "ok" : "fora_do_perfil";
}

/**
 * SEÇÕES DO GABINETE dentro de Configurações.
 *
 * O menu lateral do gabinete ficou só com o uso diário (`menu-do-gabinete`). O que
 * se configura UMA vez — a identidade do mandato, os números de WhatsApp, o
 * assistente de IA — e as demais telas de ajuste passam a ter porta
 * AQUI, em seções. Nenhuma tela some: cada cartão só aparece para quem já podia
 * abrir a tela (a lista vem filtrada por `visiveis`).
 *
 * Componente de servidor, sem estado.
 */
import Link from "next/link";

interface Cartao {
  href: string;
  titulo: string;
  texto: string;
  /** Tela-índice não tem entrada própria no catálogo: aparece para quem enxerga ESTA outra. */
  seVe?: string;
  /** Selo curto no cartão (ex.: "Comece por aqui"). */
  selo?: string;
}

interface Secao {
  titulo: string;
  texto: string;
  cartoes: Cartao[];
  /** Seção fechada por padrão (o que quase ninguém usa). */
  recolhida?: boolean;
}

const SECOES: Secao[] = [
  {
    titulo: "Meu mandato",
    texto: "Quem é o parlamentar, como o gabinete se apresenta e o que o cidadão pode ver.",
    cartoes: [
      { href: "/app/politico/configuracao", titulo: "Configurar mandato", texto: "O passo a passo inicial: tipo de mandato, cidade e jeito de atender.", selo: "Comece por aqui" },
      { href: "/app/politico/identidade", titulo: "Identidade do mandato", texto: "Nome, cargo, timbre e assinatura que saem nos ofícios e nas mensagens." },
      { href: "/app/politico/enriquecer", titulo: "Aprofundar o mandato", texto: "Busca informações públicas do mandato para o assistente responder melhor. Você aprova item a item." },
      { href: "/app/politico/transparencia", titulo: "Portal da Transparência", texto: "A página pública com obras e emendas que você escolher mostrar." },
      { href: "/app/politico/voz", titulo: "Voz do Mandato", texto: "Recados em áudio na voz do parlamentar, com o aviso de que foram criados com IA." },
    ],
  },
  {
    titulo: "WhatsApp e Instagram",
    texto: "Os números e as contas por onde o gabinete conversa.",
    cartoes: [
      { href: "/app/connections", titulo: "Números de WhatsApp", texto: "Conectar, pausar e ver a saúde de cada número." },
      { href: "/app/instagram/conectar", titulo: "Conta do Instagram", texto: "Ligar a conta do mandato para captar quem comenta." },
    ],
  },
  {
    titulo: "Assistente de IA",
    texto: "Quem responde quando o cidadão escreve, o que ele sabe e quanto pode gastar.",
    cartoes: [
      { href: "/app/ai/agents", titulo: "Assistente do gabinete", texto: "O jeito de falar, o horário e se ele responde sozinho ou só sugere." },
      { href: "/app/ai/knowledge/sources", titulo: "O que ele sabe", texto: "Os materiais que o assistente consulta para responder." },
      { href: "/app/ai/usage", titulo: "Uso e teto de gasto", texto: "Quanto a IA gastou no mês e o limite que você definiu." },
    ],
  },
  {
    titulo: "Equipe",
    texto: "Quem trabalha no gabinete, o que cada um vê e quem recebe cada conversa.",
    cartoes: [
      { href: "/app/team", titulo: "Equipe", texto: "Convidar pessoas, definir o papel e o que cada uma vê no menu." },
      { href: "/app/settings/atendimento", titulo: "Quem recebe cada conversa", texto: "Para quem vai cada contato novo e o que cada atendente enxerga." },
      { href: "/app/settings/tenant/agenda", titulo: "Tipos de compromisso", texto: "O que se pode marcar na agenda, quanto dura e quem atende." },
    ],
  },
  {
    titulo: "Seu gabinete",
    texto: "Os dados do gabinete dentro do sistema.",
    cartoes: [
      { href: "/app/settings/tenant", titulo: "Dados do gabinete", texto: "Nome, dados legais, por quanto tempo guardar as informações e o responsável pela LGPD." },
      { href: "/app/settings/marca", titulo: "Nome e cor do sistema", texto: "O nome e a cor que aparecem para a sua equipe." },
      { href: "/app/settings/tags", titulo: "Etiquetas", texto: "As etiquetas que a equipe usa para marcar pessoas e conversas." },
      { href: "/app/lgpd/requests", titulo: "Pedidos de LGPD", texto: "Pedidos de cidadãos para ver, corrigir ou apagar os próprios dados." },
    ],
  },
  {
    titulo: "Sua conta",
    texto: "O que é só seu.",
    cartoes: [
      { href: "/app/settings/profile", titulo: "Perfil", texto: "Seu nome, idioma, fuso horário e foto." },
      { href: "/app/settings/security", titulo: "Segurança", texto: "Senha, verificação em duas etapas e os aparelhos em que você está conectado." },
      { href: "/app/settings/notifications", titulo: "Notificações", texto: "Por onde e sobre o quê você quer ser avisado." },
    ],
  },
  {
    titulo: "Avançado",
    texto: "Ajustes técnicos. Quase ninguém precisa abrir.",
    recolhida: true,
    cartoes: [
      { href: "/app/ai", titulo: "Todas as telas da IA", texto: "A lista completa dos ajustes do assistente, para quem configura.", seVe: "/app/ai/agents" },
      { href: "/app/settings/recursos", titulo: "Recursos opcionais", texto: "O que está ligado ou desligado no sistema." },
      { href: "/app/settings/automacoes", titulo: "Regras automáticas", texto: "O limite geral das regras em que a IA escolhe o próximo passo." },
      { href: "/app/settings/api-tokens", titulo: "Chaves de integração", texto: "Para outro sistema conversar com este. Só para quem integra." },
      { href: "/app/settings/voip-trunk", titulo: "Telefonia", texto: "Dados do provedor de telefonia para ligações por voz." },
      { href: "/app/integracao-dados", titulo: "Dados externos", texto: "Ligar o sistema a uma base de dados de fora." },
      { href: "/app/webhooks", titulo: "Formulários do site", texto: "Receber no sistema os cadastros feitos num site externo." },
      { href: "/app/ads/meta", titulo: "Anúncios (Facebook e Instagram)", texto: "Acompanhar os anúncios pagos da conta." },
      { href: "/app/kanban", titulo: "Quadros de etapas", texto: "Quadros livres para organizar qualquer coisa em colunas." },
      { href: "/app/crm", titulo: "Outras telas", texto: "O índice das telas que não fazem parte do dia a dia do gabinete.", seVe: "/app/kanban" },
      { href: "/app/analise", titulo: "Registros e auditoria", texto: "Quem fez o quê no sistema, e os números de uso.", seVe: "/app/audit" },
    ],
  },
];

/** Todos os endereços que as seções já cobrem (a página usa para achar o que sobrou). */
export const ENDERECOS_DAS_SECOES: ReadonlySet<string> = new Set(SECOES.flatMap((s) => s.cartoes.map((c) => c.href)));

export function SecoesDoGabinete({
  visiveis,
  resto = [],
}: {
  visiveis: ReadonlySet<string>;
  /** Telas de Configurações que não têm cartão declarado aqui: entram no Avançado, para nada se perder. */
  resto?: readonly Cartao[];
}) {
  const secoes = SECOES.map((s) => ({
    ...s,
    cartoes: [...s.cartoes.filter((c) => visiveis.has(c.seVe ?? c.href)), ...(s.recolhida ? resto : [])],
  })).filter((s) => s.cartoes.length > 0);
  if (secoes.length === 0) return null;

  const grade = (cartoes: readonly Cartao[]) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cartoes.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-xl border p-4 transition-colors hover:border-[color:var(--color-accent,#C4E64A)]"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface, transparent)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {c.titulo}
            {c.selo ? (
              <span className="ml-2 rounded-full px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide" style={{ background: "var(--color-accent, #D7F36A)", color: "#16181D" }}>
                {c.selo}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{c.texto}</p>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="mx-auto mb-10 w-full max-w-6xl space-y-8" data-secoes-do-gabinete>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>Configurações</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>O que se ajusta uma vez: o mandato, os canais, o assistente, a equipe e a sua conta.</p>
      </header>
      {secoes.map((s) =>
        s.recolhida ? (
          <details key={s.titulo} className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)" }}>
            <summary className="cursor-pointer select-none">
              <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>{s.titulo}</span>
              <span className="ml-2 text-xs" style={{ color: "var(--color-text-muted)" }}>{s.texto}</span>
            </summary>
            <div className="mt-4">{grade(s.cartoes)}</div>
          </details>
        ) : (
          <section key={s.titulo}>
            <h2 className="text-base font-bold" style={{ color: "var(--color-text)" }}>{s.titulo}</h2>
            <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{s.texto}</p>
            {grade(s.cartoes)}
          </section>
        ),
      )}
    </div>
  );
}

export default SecoesDoGabinete;

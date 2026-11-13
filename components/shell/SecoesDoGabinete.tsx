/**
 * SEÇÕES DO GABINETE dentro de Configurações.
 *
 * O menu lateral do gabinete ficou só com o uso diário (`menu-do-gabinete`). O que
 * se configura UMA vez — a identidade do mandato, os números de WhatsApp, o
 * assistente de IA — e as telas herdadas do sistema base passam a ter porta
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
      { href: "/app/politico/identidade", titulo: "Identidade do mandato", texto: "Nome, cargo, timbre e assinatura que saem nos ofícios e nas mensagens." },
      { href: "/app/politico/configuracao", titulo: "Configurar mandato", texto: "O passo a passo inicial: tipo de mandato, cidade e jeito de atender." },
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
      { href: "/app/ai", titulo: "Todos os ajustes da IA", texto: "A lista completa, para quem configura.", seVe: "/app/ai/agents" },
    ],
  },
  {
    titulo: "Avançado",
    texto: "Telas técnicas e as herdadas do sistema base. Quase ninguém precisa abrir.",
    recolhida: true,
    cartoes: [
      { href: "/app/webhooks", titulo: "Formulários do site", texto: "Receber no sistema os cadastros feitos num site externo." },
      { href: "/app/ads/meta", titulo: "Anúncios (Facebook e Instagram)", texto: "Acompanhar os anúncios pagos da conta." },
      { href: "/app/kanban", titulo: "Quadros de etapas", texto: "Os quadros genéricos do sistema base." },
      { href: "/app/crm", titulo: "Telas do sistema base", texto: "O índice das telas herdadas que não fazem parte do dia a dia do gabinete.", seVe: "/app/kanban" },
      { href: "/app/analise", titulo: "Registros e auditoria", texto: "Quem fez o quê no sistema, e os números de uso.", seVe: "/app/audit" },
    ],
  },
];

export function SecoesDoGabinete({ visiveis }: { visiveis: ReadonlySet<string> }) {
  const secoes = SECOES.map((s) => ({ ...s, cartoes: s.cartoes.filter((c) => visiveis.has(c.seVe ?? c.href)) })).filter((s) => s.cartoes.length > 0);
  if (secoes.length === 0) return null;

  const grade = (cartoes: Cartao[]) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cartoes.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-xl border p-4 transition-colors hover:border-[color:var(--color-accent,#C4E64A)]"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface, transparent)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{c.titulo}</p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{c.texto}</p>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="mx-auto mb-10 w-full max-w-6xl space-y-8" data-secoes-do-gabinete>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>Configurações</h1>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>O que se ajusta uma vez: o mandato, os canais, o assistente e a equipe.</p>
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

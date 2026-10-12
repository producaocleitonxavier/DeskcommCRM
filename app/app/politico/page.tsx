/**
 * /app/politico — Hub War Room 2.0
 *
 * Central de comando do módulo político. Organizado em 5 seções:
 * Inteligência, Execução, Território, Operação e Gabinete.
 *
 * Consolidação (out/2026): 16 sub-páginas → 5 seções temáticas.
 * Páginas eliminadas: dashboard (redundante), projecao (→ raio-x),
 * rankings (→ mapa), narrativas (→ adversários), territorios (→ mapa).
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/get-user";
import { resolverOrganizacaoAtiva } from "@/lib/organizations/resolver";

// -- Tipos -------------------------------------------------------------------

interface MetricasWarRoom {
  totalLeads: number;
  votosCertos: number;
  alertasAtivos: number;
  transicoesHoje: number;
}

// -- Data fetching -----------------------------------------------------------

async function buscarMetricas(organizationId: string): Promise<MetricasWarRoom> {
  const db = createServerClient();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = hoje.toISOString();

  const [totalLeads, votosCertos, alertasAtivos, transicoesHoje] = await Promise.all([
    db
      .from("pol_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),

    db
      .from("pol_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("support_level", "voto_certo"),

    db
      .from("pol_alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),

    db
      .from("pol_funnel_transitions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", hojeISO),
  ]);

  return {
    totalLeads: totalLeads.count ?? 0,
    votosCertos: votosCertos.count ?? 0,
    alertasAtivos: alertasAtivos.count ?? 0,
    transicoesHoje: transicoesHoje.count ?? 0,
  };
}

// -- Dados das seções --------------------------------------------------------

interface ItemSecao {
  href: string;
  titulo: string;
  descricao: string;
  icone: string;
  badge?: string | null;
  novo?: boolean;
}

interface Secao {
  titulo: string;
  icone: string;
  cor: string;
  items: ItemSecao[];
}

function montarSecoes(m: MetricasWarRoom): Secao[] {
  return [
    {
      titulo: "Inteligência",
      icone: "🧠",
      cor: "text-violet-500",
      items: [
        {
          href: "/app/politico/social",
          titulo: "Inteligência Social",
          descricao: "Perfis monitorados, métricas e posts coletados das redes.",
          icone: "📱",
        },
        {
          href: "/app/politico/adversarios",
          titulo: "Adversários",
          descricao: "Dossiê de oponentes — risco, narrativa e sinais de alerta.",
          icone: "🛡️",
        },
        {
          href: "/app/politico/alertas",
          titulo: "Alertas & Risco",
          descricao: "Sentimento, crise, fake news e adversários.",
          icone: "🔔",
          badge: m.alertasAtivos > 0 ? `${m.alertasAtivos} ativo${m.alertasAtivos !== 1 ? "s" : ""}` : null,
        },
        {
          href: "/app/politico/decisao",
          titulo: "Decision Engine",
          descricao: "Sinais estratégicos e ações recomendadas por IA.",
          icone: "⚡",
          novo: true,
        },
      ],
    },
    {
      titulo: "Execução",
      icone: "🚀",
      cor: "text-orange-500",
      items: [
        {
          href: "/app/politico/motor-viral",
          titulo: "Motor Viral",
          descricao: "Scripts, captions e roteiros com scoring de viralidade.",
          icone: "✨",
        },
        {
          href: "/app/politico/funil-invisivel",
          titulo: "Funil Invisível",
          descricao: "Nurturing automático com scoring de afinidade.",
          icone: "👁️",
        },
      ],
    },
    {
      titulo: "Território",
      icone: "🗺️",
      cor: "text-emerald-500",
      items: [
        {
          href: "/app/politico/mapa-eleitoral",
          titulo: "Mapa & Cidades",
          descricao: "Territórios, oportunidades e rankings de cidades.",
          icone: "📍",
        },
        {
          href: "/app/politico/raio-x",
          titulo: "Raio-X de Votos",
          descricao: "Análise por seção eleitoral — TSE, evolução e ações.",
          icone: "🔍",
          novo: true,
        },
      ],
    },
    {
      titulo: "Operação",
      icone: "⚙️",
      cor: "text-blue-500",
      items: [
        {
          href: "/app/politico/leads",
          titulo: "Base de Leads",
          descricao: "Apoiadores, simpatizantes e militantes com scoring.",
          icone: "👥",
          badge: m.totalLeads > 0 ? `${m.totalLeads.toLocaleString("pt-BR")} leads` : null,
        },
        {
          href: "/app/politico/funil",
          titulo: "Funil Eleitoral",
          descricao: "Kanban — de novo cadastro até voto certo.",
          icone: "📊",
          badge: m.transicoesHoje > 0 ? `${m.transicoesHoje} hoje` : null,
        },
        {
          href: "/app/politico/ligacoes",
          titulo: "Ligações",
          descricao: "Fila de ligações com resultado e controle.",
          icone: "📞",
        },
        {
          href: "/app/politico/eventos",
          titulo: "Eventos",
          descricao: "Presença, participantes e dados institucionais.",
          icone: "📅",
        },
        {
          href: "/app/politico/pesquisas",
          titulo: "Pesquisas",
          descricao: "Formulários públicos com respostas geolocalizadas.",
          icone: "📋",
        },
      ],
    },
    {
      titulo: "Gabinete",
      icone: "🏛️",
      cor: "text-amber-500",
      items: [
        {
          href: "/app/politico/demandas",
          titulo: "Demandas",
          descricao: "Solicitações com rascunho de encaminhamento por IA.",
          icone: "📥",
          novo: true,
        },
        {
          href: "/app/politico/liderancas",
          titulo: "Lideranças",
          descricao: "Rede de lideranças com aniversários e WhatsApp.",
          icone: "👑",
          novo: true,
        },
        {
          href: "/app/politico/projetos-lei",
          titulo: "Projetos de Lei",
          descricao: "Acompanhamento legislativo por tipo de mandato.",
          icone: "📜",
          novo: true,
        },
        {
          href: "/app/politico/emendas",
          titulo: "Emendas",
          descricao: "Emendas parlamentares — valores, destino e status.",
          icone: "💰",
          novo: true,
        },
      ],
    },
  ];
}

// -- Componente --------------------------------------------------------------

export default async function WarRoomHubPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const org = await resolverOrganizacaoAtiva(user.id);
  if (!org) redirect("/app/onboarding");

  const metricas = await buscarMetricas(org.id);
  const secoes = montarSecoes(metricas);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">War Room</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Central de comando — campanha política, gabinete e inteligência eleitoral.
        </p>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Base de leads" valor={metricas.totalLeads.toLocaleString("pt-BR")} cor="text-blue-500" />
        <KpiCard label="Votos certos" valor={metricas.votosCertos.toLocaleString("pt-BR")} cor="text-emerald-500" />
        <KpiCard label="Alertas ativos" valor={String(metricas.alertasAtivos)} cor={metricas.alertasAtivos > 0 ? "text-red-500" : "text-muted-foreground"} />
        <KpiCard label="Transições hoje" valor={String(metricas.transicoesHoje)} cor="text-violet-500" />
      </div>

      {/* Seções */}
      <div className="space-y-6">
        {secoes.map((secao) => (
          <section key={secao.titulo}>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              <span>{secao.icone}</span>
              <span>{secao.titulo}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {secao.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/30"
                >
                  <span className="mt-0.5 text-xl shrink-0">{item.icone}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                        {item.titulo}
                      </h3>
                      {item.novo && (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                          Novo
                        </span>
                      )}
                      {item.badge && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                      {item.descricao}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Instrução quando vazio */}
      {metricas.totalLeads === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Para começar:</strong> cadastre seus primeiros leads em{" "}
          <Link href="/app/politico/leads" className="font-medium underline underline-offset-4">
            Base de Leads
          </Link>{" "}
          e mapeie seus territórios no{" "}
          <Link href="/app/politico/mapa-eleitoral" className="font-medium underline underline-offset-4">
            Mapa & Cidades
          </Link>
          .
        </div>
      )}
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function KpiCard({
  label,
  valor,
  cor,
}: {
  label: string;
  valor: string;
  cor: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

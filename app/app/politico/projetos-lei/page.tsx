/**
 * /app/politico/projetos-lei — Gabinete Digital: Projetos de Lei
 *
 * Acompanhamento legislativo configurável por tipo de mandato.
 * Tabela: pol_projetos_lei.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/get-user";
import { resolverOrganizacaoAtiva } from "@/lib/organizations/resolver";

// -- Tipos -------------------------------------------------------------------

interface ProjetoLei {
  id: string;
  numero: string;
  tipo: string;
  esfera: string;
  titulo: string;
  ementa: string | null;
  tema: string | null;
  status: string;
  prioridade: string;
  autor_mandatario: boolean;
  alinhamento_campanha: boolean;
  data_apresentacao: string | null;
  data_ultima_movimentacao: string | null;
  comissao_atual: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  apresentado: "Apresentado",
  em_tramitacao: "Em tramitação",
  em_comissao: "Em comissão",
  aprovado_comissao: "Aprovado comissão",
  em_plenario: "Em plenário",
  aprovado: "Aprovado",
  vetado: "Vetado",
  promulgado: "Promulgado",
  arquivado: "Arquivado",
  retirado: "Retirado",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  apresentado: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  em_tramitacao: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  em_comissao: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  aprovado_comissao: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  em_plenario: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  aprovado: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  vetado: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  promulgado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  arquivado: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  retirado: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const ESFERA_LABELS: Record<string, string> = {
  municipal: "Municipal",
  estadual: "Estadual",
  federal: "Federal",
};

// -- Data fetching -----------------------------------------------------------

async function buscarProjetos(organizationId: string): Promise<ProjetoLei[]> {
  const db = createServerClient();
  const { data } = await db
    .from("pol_projetos_lei")
    .select(
      "id, numero, tipo, esfera, titulo, ementa, tema, status, prioridade, autor_mandatario, alinhamento_campanha, data_apresentacao, data_ultima_movimentacao, comissao_atual"
    )
    .eq("organization_id", organizationId)
    .order("data_ultima_movimentacao", { ascending: false, nullsFirst: false })
    .limit(100);

  return (data ?? []) as ProjetoLei[];
}

// -- Componente --------------------------------------------------------------

export default async function ProjetosLeiPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const org = await resolverOrganizacaoAtiva(user.id);
  if (!org) redirect("/app/onboarding");

  const projetos = await buscarProjetos(org.id);

  const emTramitacao = projetos.filter(
    (p) => !["aprovado", "vetado", "promulgado", "arquivado", "retirado"].includes(p.status)
  );
  const concluidos = projetos.filter((p) =>
    ["aprovado", "vetado", "promulgado", "arquivado", "retirado"].includes(p.status)
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projetos de Lei</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhamento legislativo — projetos, indicações e requerimentos.
          </p>
        </div>
        <Link
          href="/app/politico"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← War Room
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Em tramitação" valor={String(emTramitacao.length)} cor="text-yellow-500" />
        <KpiCard
          label="De autoria"
          valor={String(projetos.filter((p) => p.autor_mandatario).length)}
          cor="text-blue-500"
        />
        <KpiCard
          label="Alinhados à campanha"
          valor={String(projetos.filter((p) => p.alinhamento_campanha).length)}
          cor="text-emerald-500"
        />
        <KpiCard
          label="Aprovados"
          valor={String(projetos.filter((p) => ["aprovado", "promulgado"].includes(p.status)).length)}
          cor="text-green-500"
        />
      </div>

      {/* Em tramitação */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Em tramitação ({emTramitacao.length})
        </h2>
        {emTramitacao.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum projeto em tramitação.</p>
        ) : (
          <div className="space-y-2">
            {emTramitacao.map((p) => (
              <ProjetoCard key={p.id} projeto={p} />
            ))}
          </div>
        )}
      </section>

      {/* Concluídos */}
      {concluidos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Concluídos ({concluidos.length})
          </h2>
          <div className="space-y-2 opacity-70">
            {concluidos.slice(0, 10).map((p) => (
              <ProjetoCard key={p.id} projeto={p} />
            ))}
          </div>
        </section>
      )}

      {projetos.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Legislativo:</strong> cadastre projetos de lei, indicações e requerimentos para
          acompanhar a tramitação e o alinhamento com a campanha.
        </div>
      )}
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function ProjetoCard({ projeto }: { projeto: ProjetoLei }) {
  const statusCor = STATUS_COLORS[projeto.status] ?? STATUS_COLORS.em_tramitacao;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground">{projeto.numero}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCor}`}>
            {STATUS_LABELS[projeto.status] ?? projeto.status}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {ESFERA_LABELS[projeto.esfera] ?? projeto.esfera}
          </span>
          {projeto.alinhamento_campanha && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              campanha
            </span>
          )}
          {projeto.prioridade === "urgente" && (
            <span className="text-[10px] font-bold uppercase text-red-600 dark:text-red-400">
              urgente
            </span>
          )}
        </div>
        <h3 className="mt-1 font-semibold text-sm">{projeto.titulo}</h3>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {projeto.tema && <span>{projeto.tema}</span>}
          {projeto.comissao_atual && <span>📋 {projeto.comissao_atual}</span>}
          {projeto.data_ultima_movimentacao && (
            <span>Movimentado: {new Date(projeto.data_ultima_movimentacao).toLocaleDateString("pt-BR")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

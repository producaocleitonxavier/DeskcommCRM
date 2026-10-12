/**
 * /app/politico/demandas — Gabinete Digital: Demandas
 *
 * Solicitações do cidadão com rascunho de encaminhamento por IA.
 * Tabela: demandas (com extensões pol_*).
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/get-user";
import { resolverOrganizacaoAtiva } from "@/lib/organizations/resolver";

// -- Tipos -------------------------------------------------------------------

interface Demanda {
  id: string;
  assunto: string | null;
  estado: string;
  origem: string | null;
  pol_tipo: string | null;
  pol_prioridade: string | null;
  pol_orgao_destino: string | null;
  pol_encaminhamento_ia: string | null;
  dono_kind: string | null;
  aberta_em: string;
  prazo_em: string | null;
  desfecho: string | null;
}

const ESTADO_LABELS: Record<string, string> = {
  aberta: "Aberta",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando",
  resolvida: "Resolvida",
  encerrada: "Encerrada",
};

const ESTADO_COLORS: Record<string, string> = {
  aberta: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  em_atendimento: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  aguardando_cliente: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  resolvida: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  encerrada: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa: "text-muted-foreground",
  normal: "text-blue-600 dark:text-blue-400",
  alta: "text-orange-600 dark:text-orange-400",
  urgente: "text-red-600 dark:text-red-400",
};

// -- Data fetching -----------------------------------------------------------

async function buscarDemandas(organizationId: string): Promise<Demanda[]> {
  const db = createServerClient();
  const { data } = await db
    .from("demandas")
    .select("id, assunto, estado, origem, pol_tipo, pol_prioridade, pol_orgao_destino, pol_encaminhamento_ia, dono_kind, aberta_em, prazo_em, desfecho")
    .eq("organization_id", organizationId)
    .order("aberta_em", { ascending: false })
    .limit(100);

  return (data ?? []) as Demanda[];
}

// -- Componente --------------------------------------------------------------

export default async function DemandasPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const org = await resolverOrganizacaoAtiva(user.id);
  if (!org) redirect("/app/onboarding");

  const demandas = await buscarDemandas(org.id);

  const abertas = demandas.filter((d) => !["resolvida", "encerrada"].includes(d.estado));
  const resolvidas = demandas.filter((d) => ["resolvida", "encerrada"].includes(d.estado));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demandas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Solicitações do cidadão — encaminhamento com rascunho por IA.
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
        <KpiCard label="Abertas" valor={String(abertas.length)} cor="text-blue-500" />
        <KpiCard
          label="Urgentes"
          valor={String(demandas.filter((d) => d.pol_prioridade === "urgente" && !["resolvida", "encerrada"].includes(d.estado)).length)}
          cor="text-red-500"
        />
        <KpiCard
          label="Com IA"
          valor={String(demandas.filter((d) => d.pol_encaminhamento_ia).length)}
          cor="text-violet-500"
        />
        <KpiCard label="Resolvidas" valor={String(resolvidas.length)} cor="text-emerald-500" />
      </div>

      {/* Lista de demandas abertas */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Demandas ativas ({abertas.length})
        </h2>
        {abertas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma demanda ativa no momento.</p>
        ) : (
          <div className="space-y-2">
            {abertas.map((d) => (
              <DemandaCard key={d.id} demanda={d} />
            ))}
          </div>
        )}
      </section>

      {/* Resolvidas (colapsável) */}
      {resolvidas.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Resolvidas / Encerradas ({resolvidas.length})
          </h2>
          <div className="space-y-2 opacity-70">
            {resolvidas.slice(0, 10).map((d) => (
              <DemandaCard key={d.id} demanda={d} />
            ))}
            {resolvidas.length > 10 && (
              <p className="text-xs text-muted-foreground pl-4">
                +{resolvidas.length - 10} demandas anteriores
              </p>
            )}
          </div>
        </section>
      )}

      {demandas.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Gabinete Digital:</strong> cadastre a primeira demanda para iniciar o
          acompanhamento com encaminhamento assistido por IA.
        </div>
      )}
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function DemandaCard({ demanda }: { demanda: Demanda }) {
  const estadoCor = ESTADO_COLORS[demanda.estado] ?? ESTADO_COLORS.aberta;
  const prioridadeCor = PRIORIDADE_COLORS[demanda.pol_prioridade ?? "normal"] ?? "";
  const temIA = !!demanda.pol_encaminhamento_ia;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm truncate">
            {demanda.assunto || "Sem assunto"}
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${estadoCor}`}>
            {ESTADO_LABELS[demanda.estado] ?? demanda.estado}
          </span>
          {demanda.pol_prioridade && demanda.pol_prioridade !== "normal" && (
            <span className={`text-[10px] font-bold uppercase ${prioridadeCor}`}>
              {demanda.pol_prioridade}
            </span>
          )}
          {temIA && (
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-300">
              IA
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {demanda.pol_tipo && <span>{demanda.pol_tipo.replace(/_/g, " ")}</span>}
          {demanda.pol_orgao_destino && <span>→ {demanda.pol_orgao_destino}</span>}
          <span>{new Date(demanda.aberta_em).toLocaleDateString("pt-BR")}</span>
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

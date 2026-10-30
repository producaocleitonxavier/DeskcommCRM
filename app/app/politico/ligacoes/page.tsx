/**
 * /app/politico/ligacoes — Fila de Ligacoes (War Room 2.0 Fase 3)
 *
 * Lista de ligacoes da campanha com status, resultado e prioridade.
 * Tabela: pol_call_queue joined com contacts.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

interface Ligacao {
  id: string;
  contact_id: string;
  call_status: string;
  political_result: string | null;
  attempt_count: number;
  assigned_to: string | null;
  priority: string | null;
  created_at: string;
  contacts: {
    name: string | null;
    phone: string | null;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  locked: "Reservada",
  calling: "Em ligação",
  completed: "Concluída",
  no_answer: "Sem resposta",
  busy: "Ocupado",
  callback: "Retorno",
  cancelled: "Cancelada",
};

const PRIORIDADE_LABELS: Record<string, string> = {
  urgent: "Urgente", urgente: "Urgente",
  high: "Alta", alta: "Alta",
  medium: "Média", media: "Média", normal: "Normal",
  low: "Baixa", baixa: "Baixa",
};

const RESULTADO_LABELS: Record<string, string> = {
  apoio: "Apoio confirmado", apoiador: "Apoiador",
  indeciso: "Indeciso", neutro: "Neutro",
  recusa: "Recusa", contrario: "Contrário",
  sem_resposta: "Sem resposta", nao_atende: "Não atende", retornar: "Retornar",
};

/** Rótulo pt-BR de um valor cru do banco; se não mapeado, humaniza (tira "_" e capitaliza). */
function rotuloHumano(mapa: Record<string, string>, v: string | null): string {
  if (!v) return "—";
  return mapa[v.toLowerCase()] ?? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// -- Data fetching -----------------------------------------------------------

async function buscarLigacoes(
  organizationId: string,
  filtroStatus?: string,
): Promise<Ligacao[]> {
  const db = await createClient();

  let query = db
    .from("pol_call_queue")
    .select("id, contact_id, call_status, political_result, attempt_count, assigned_to, priority, created_at, contacts(name, phone)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filtroStatus) {
    query = query.eq("call_status", filtroStatus);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Erro ao buscar ligacoes:", error.message);
    return [];
  }

  return (data ?? []) as unknown as Ligacao[];
}

// -- Componente --------------------------------------------------------------

export default async function LigacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const params = await searchParams;
  const filtroStatus = params.status ?? "";

  const ligacoes = await buscarLigacoes(org.orgId, filtroStatus || undefined);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Voltar */}
      <Link
        href="/app/politico"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; War Room
      </Link>

      {/* Cabecalho */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fila de Ligacoes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie as ligacoes da campanha com status, resultado politico e prioridade.
        </p>
      </div>

      {/* Filtro */}
      <div className="flex flex-wrap gap-2">
        <FilterLink href="/app/politico/ligacoes" label="Todos" active={!filtroStatus} />
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <FilterLink
            key={value}
            href={`/app/politico/ligacoes?status=${value}`}
            label={label}
            active={filtroStatus === value}
          />
        ))}
      </div>

      {/* Tabela */}
      {ligacoes.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma ligacao encontrada.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Resultado</th>
                <th className="px-4 py-3 font-medium">Tentativas</th>
                <th className="px-4 py-3 font-medium">Responsavel</th>
                <th className="px-4 py-3 font-medium">Prioridade</th>
              </tr>
            </thead>
            <tbody>
              {ligacoes.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {l.contacts?.name ?? "Sem nome"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {l.contacts?.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.call_status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {rotuloHumano(RESULTADO_LABELS, l.political_result)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {l.attempt_count}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {l.assigned_to ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {l.priority ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {rotuloHumano(PRIORIDADE_LABELS, l.priority)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      }`}
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {label}
    </span>
  );
}

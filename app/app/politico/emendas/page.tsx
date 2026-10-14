/**
 * /app/politico/emendas — Gabinete Digital: Emendas Parlamentares
 *
 * Emendas com valores, destino municipal/entidade e status de execução.
 * Tabela: pol_emendas.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

interface Emenda {
  id: string;
  numero: string | null;
  ano: number;
  tipo: string;
  esfera: string;
  valor_indicado_cents: number;
  valor_empenhado_cents: number;
  valor_pago_cents: number;
  municipio: string | null;
  entidade_beneficiada: string | null;
  area_tematica: string;
  descricao: string;
  status: string;
  data_indicacao: string | null;
  beneficiarios_estimados: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  indicada: "Indicada",
  empenhada: "Empenhada",
  liquidada: "Liquidada",
  paga: "Paga",
  devolvida: "Devolvida",
  cancelada: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  indicada: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  empenhada: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  liquidada: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  paga: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  devolvida: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelada: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const AREA_LABELS: Record<string, string> = {
  saude: "Saúde",
  educacao: "Educação",
  seguranca: "Segurança",
  assistencia_social: "Assist. Social",
  infraestrutura: "Infraestrutura",
  cultura: "Cultura",
  esporte: "Esporte",
  meio_ambiente: "Meio Ambiente",
  agricultura: "Agricultura",
  tecnologia: "Tecnologia",
  outro: "Outro",
};

function formatarMoeda(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// -- Data fetching -----------------------------------------------------------

async function buscarEmendas(organizationId: string): Promise<Emenda[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_emendas")
    .select(
      "id, numero, ano, tipo, esfera, valor_indicado_cents, valor_empenhado_cents, valor_pago_cents, municipio, entidade_beneficiada, area_tematica, descricao, status, data_indicacao, beneficiarios_estimados"
    )
    .eq("organization_id", organizationId)
    .order("ano", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []) as Emenda[];
}

// -- Componente --------------------------------------------------------------

export default async function EmendasPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const emendas = await buscarEmendas(org.orgId);

  const totalIndicado = emendas.reduce((s, e) => s + e.valor_indicado_cents, 0);
  const totalEmpenhado = emendas.reduce((s, e) => s + e.valor_empenhado_cents, 0);
  const totalPago = emendas.reduce((s, e) => s + e.valor_pago_cents, 0);
  const ativas = emendas.filter((e) => !["paga", "devolvida", "cancelada"].includes(e.status));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Emendas Parlamentares</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Valores, municípios destino e status de execução.
          </p>
        </div>
        <Link
          href="/app/politico"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← War Room
        </Link>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total indicado" valor={formatarMoeda(totalIndicado)} cor="text-blue-500" />
        <KpiCard label="Empenhado" valor={formatarMoeda(totalEmpenhado)} cor="text-yellow-500" />
        <KpiCard label="Pago" valor={formatarMoeda(totalPago)} cor="text-emerald-500" />
        <KpiCard label="Emendas ativas" valor={String(ativas.length)} cor="text-violet-500" />
      </div>

      {/* Barra de execução */}
      {totalIndicado > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Execução orçamentária</span>
            <span>{Math.round((totalPago / totalIndicado) * 100)}% pago</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, (totalPago / totalIndicado) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Lista */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Todas as emendas ({emendas.length})
        </h2>
        {emendas.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <strong>Emendas:</strong> cadastre emendas parlamentares para acompanhar indicação,
            empenho, liquidação e pagamento por município ou entidade.
          </div>
        ) : (
          <div className="space-y-2">
            {emendas.map((e) => (
              <EmendaCard key={e.id} emenda={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function EmendaCard({ emenda }: { emenda: Emenda }) {
  const statusCor = STATUS_COLORS[emenda.status] ?? STATUS_COLORS.indicada;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground">
            {emenda.numero ?? `${emenda.ano}`}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCor}`}>
            {STATUS_LABELS[emenda.status] ?? emenda.status}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase">{emenda.tipo}</span>
          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {AREA_LABELS[emenda.area_tematica] ?? emenda.area_tematica}
          </span>
        </div>
        <p className="mt-1 text-sm">{emenda.descricao}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="font-semibold text-foreground">
            {formatarMoeda(emenda.valor_indicado_cents)}
          </span>
          {emenda.municipio && <span>📍 {emenda.municipio}</span>}
          {emenda.entidade_beneficiada && <span>🏢 {emenda.entidade_beneficiada}</span>}
          {emenda.beneficiarios_estimados && (
            <span>👥 {emenda.beneficiarios_estimados.toLocaleString("pt-BR")} beneficiários</span>
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

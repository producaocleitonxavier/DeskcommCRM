/**
 * /app/politico/liderancas — Gabinete Digital: Lideranças
 *
 * Rede de lideranças políticas com aniversários, WhatsApp e métricas
 * de mobilização. Tabela: pol_liderancas.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

interface Lideranca {
  id: string;
  nome: string;
  apelido: string | null;
  cargo: string | null;
  tipo: string;
  whatsapp: string | null;
  aniversario: string | null;
  cidade: string | null;
  bairro: string | null;
  leads_mobilizados: number;
  eventos_organizados: number;
  nivel_engajamento: string;
  status: string;
  ultimo_contato_em: string | null;
}

const TIPO_LABELS: Record<string, string> = {
  cabo_eleitoral: "Cabo eleitoral",
  coordenador_bairro: "Coord. bairro",
  coordenador_cidade: "Coord. cidade",
  lider_comunitario: "Líder comunitário",
  vereador_aliado: "Vereador aliado",
  presidente_associacao: "Pres. associação",
  lider_religioso: "Líder religioso",
  lider_sindical: "Líder sindical",
  assessor: "Assessor",
  outro: "Outro",
};

const ENGAJAMENTO_COLORS: Record<string, string> = {
  baixo: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  medio: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  alto: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  critico: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

// -- Data fetching -----------------------------------------------------------

async function buscarLiderancas(organizationId: string): Promise<Lideranca[]> {
  const db = await createClient();
  const { data } = await db
    .from("pol_liderancas")
    .select(
      "id, nome, apelido, cargo, tipo, whatsapp, aniversario, cidade, bairro, leads_mobilizados, eventos_organizados, nivel_engajamento, status, ultimo_contato_em"
    )
    .eq("organization_id", organizationId)
    .eq("status", "ativo")
    .order("nome");

  return (data ?? []) as Lideranca[];
}

function proximosAniversarios(liderancas: Lideranca[]): Lideranca[] {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const diaAtual = hoje.getDate();

  return liderancas
    .filter((l) => l.aniversario)
    .map((l) => {
      const [, mes = 1, dia = 1] = l.aniversario!.split("-").map(Number);
      let diasAte = (mes - mesAtual) * 30 + (dia - diaAtual);
      if (diasAte < 0) diasAte += 365;
      return { ...l, _diasAte: diasAte };
    })
    .sort((a, b) => (a as any)._diasAte - (b as any)._diasAte)
    .slice(0, 5);
}

// -- Componente --------------------------------------------------------------

export default async function LiderancasPage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const liderancas = await buscarLiderancas(org.orgId);
  const aniversariantes = proximosAniversarios(liderancas);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lideranças</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rede de lideranças — aniversários, WhatsApp e mobilização.
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
        <KpiCard label="Lideranças ativas" valor={String(liderancas.length)} cor="text-blue-500" />
        <KpiCard
          label="Leads mobilizados"
          valor={liderancas.reduce((s, l) => s + l.leads_mobilizados, 0).toLocaleString("pt-BR")}
          cor="text-emerald-500"
        />
        <KpiCard
          label="Eventos organizados"
          valor={String(liderancas.reduce((s, l) => s + l.eventos_organizados, 0))}
          cor="text-violet-500"
        />
        <KpiCard
          label="Com WhatsApp"
          valor={String(liderancas.filter((l) => l.whatsapp).length)}
          cor="text-green-500"
        />
      </div>

      {/* Próximos aniversários */}
      {aniversariantes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            🎂 Próximos aniversários
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {aniversariantes.map((l) => {
              const [, mes, dia] = l.aniversario!.split("-").map(Number);
              return (
                <div key={l.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <span className="text-lg">🎂</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{l.apelido ?? l.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(dia).padStart(2, "0")}/{String(mes).padStart(2, "0")}
                      {l.whatsapp && " · 📱"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Lista */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Todas as lideranças ({liderancas.length})
        </h2>
        {liderancas.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <strong>Comece aqui:</strong> cadastre suas lideranças para acompanhar aniversários,
            mobilização e engajamento da rede política.
          </div>
        ) : (
          <div className="space-y-2">
            {liderancas.map((l) => (
              <LiderancaCard key={l.id} lideranca={l} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// -- Sub-componentes ---------------------------------------------------------

function LiderancaCard({ lideranca }: { lideranca: Lideranca }) {
  const engCor = ENGAJAMENTO_COLORS[lideranca.nivel_engajamento] ?? ENGAJAMENTO_COLORS.medio;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-sm">
            {lideranca.apelido ?? lideranca.nome}
          </h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${engCor}`}>
            {lideranca.nivel_engajamento}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {TIPO_LABELS[lideranca.tipo] ?? lideranca.tipo}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {lideranca.cargo && <span>{lideranca.cargo}</span>}
          {lideranca.cidade && <span>📍 {lideranca.cidade}{lideranca.bairro ? ` · ${lideranca.bairro}` : ""}</span>}
          <span>{lideranca.leads_mobilizados} leads · {lideranca.eventos_organizados} eventos</span>
          {lideranca.whatsapp && <span className="text-green-600 dark:text-green-400">📱 WhatsApp</span>}
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

/**
 * /app/politico/territorios — Lista de territórios (War Room 2.0)
 *
 * Cards de pol_territories com filtro por tipo, status de cobertura derivado
 * e KPIs do território. Server component (sem gráficos → sem client boundary).
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";

export const dynamic = "force-dynamic";

const TIPOS_TERRITORIO = [
  { value: "estado", label: "Estado" },
  { value: "cidade", label: "Cidade" },
  { value: "bairro", label: "Bairro" },
  { value: "zona_eleitoral", label: "Zona eleitoral" },
  { value: "secao", label: "Seção" },
  { value: "regiao", label: "Região" },
  { value: "distrito", label: "Distrito" },
] as const;

function labelDoTipo(value: string): string {
  return TIPOS_TERRITORIO.find((t) => t.value === value)?.label ?? value;
}

/** Status de cobertura derivado dos dados do território. */
function coberturaDe(t: TerritorioRow, filhos: number): { label: string; bg: string; fg: string } {
  const temPop = t.population != null && t.population > 0;
  const temEleitorado = t.electorate != null && t.electorate > 0;
  if (temPop && temEleitorado) return { label: "Coberto", bg: "#E2F5EC", fg: "#17784F" };
  if (temPop || temEleitorado || filhos > 0) return { label: "Em progresso", bg: "#FCF1DC", fg: "#8A5A10" };
  return { label: "Descoberto", bg: "#F0F0EB", fg: "#5B606B" };
}

interface TerritorioRow {
  id: string;
  name: string;
  type: string;
  population: number | null;
  electorate: number | null;
  parent_id: string | null;
}

async function buscarTerritorios(organizationId: string, tipo?: string) {
  const db = await createClient();
  let query = db
    .from("pol_territories")
    .select("id, name, type, population, electorate, parent_id")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (tipo) query = query.eq("type", tipo);
  const { data } = await query;
  return (data as TerritorioRow[]) ?? [];
}

async function contarFilhos(organizationId: string): Promise<Record<string, number>> {
  const db = await createClient();
  const { data } = await db
    .from("pol_territories")
    .select("parent_id")
    .eq("organization_id", organizationId)
    .not("parent_id", "is", null);
  const contagem: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.parent_id) contagem[row.parent_id] = (contagem[row.parent_id] ?? 0) + 1;
  }
  return contagem;
}

function Stat({ valor, label }: { valor: string; label: string }) {
  return (
    <div className="text-center">
      <span className="block font-heading text-lg font-bold tabular-nums leading-none">{valor}</span>
      <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function TerritoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const params = await searchParams;
  const tipo = typeof params.tipo === "string" ? params.tipo : undefined;

  const [territorios, filhosMap] = await Promise.all([
    buscarTerritorios(org.orgId, tipo),
    contarFilhos(org.orgId),
  ]);

  const cobertos = territorios.filter((t) => t.population && t.electorate).length;
  const eleitoradoTotal = territorios.reduce((s, t) => s + (t.electorate ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero eyebrow="Território" titulo="Territórios" subtitulo={`${territorios.length} território(s) gerenciado(s)`} />

      {/* Resumo */}
      <section className="grid grid-cols-3 gap-4">
        <div className="wr-card p-5">
          <div className="font-heading text-2xl font-bold tabular-nums">{territorios.length.toLocaleString("pt-BR")}</div>
          <div className="mt-1 text-sm text-muted-foreground">Territórios</div>
        </div>
        <div className="wr-card p-5">
          <div className="font-heading text-2xl font-bold tabular-nums">{cobertos.toLocaleString("pt-BR")}</div>
          <div className="mt-1 text-sm text-muted-foreground">Cobertos</div>
        </div>
        <div className="wr-card p-5">
          <div className="font-heading text-2xl font-bold tabular-nums">{eleitoradoTotal.toLocaleString("pt-BR")}</div>
          <div className="mt-1 text-sm text-muted-foreground">Eleitorado total</div>
        </div>
      </section>

      {/* Filtro por tipo */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Tipo:</span>
        {[{ value: "", label: "Todos" }, ...TIPOS_TERRITORIO].map((t) => {
          const ativo = (tipo ?? "") === t.value;
          const href = t.value ? `/app/politico/territorios?tipo=${t.value}` : "/app/politico/territorios";
          return (
            <Link
              key={t.value || "todos"}
              href={href}
              className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={
                ativo
                  ? { background: "#16181D", color: "#FFFFFF", borderColor: "#16181D" }
                  : { background: "var(--color-surface)", color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Cards */}
      {territorios.length === 0 ? (
        <div className="wr-card p-12 text-center text-sm text-muted-foreground">
          Nenhum território encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {territorios.map((t) => {
            const filhos = filhosMap[t.id] ?? 0;
            const cob = coberturaDe(t, filhos);
            return (
              <Link
                key={t.id}
                href={`/app/politico/territorios/${t.id}`}
                className="wr-card flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-snug">{t.name}</h2>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: cob.bg, color: cob.fg }}
                  >
                    {cob.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{labelDoTipo(t.type)}</span>
                <div
                  className="grid grid-cols-3 gap-2 border-t pt-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <Stat valor={t.population != null ? t.population.toLocaleString("pt-BR") : "—"} label="População" />
                  <Stat valor={t.electorate != null ? t.electorate.toLocaleString("pt-BR") : "—"} label="Eleitorado" />
                  <Stat valor={String(filhos)} label="Sub-regiões" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

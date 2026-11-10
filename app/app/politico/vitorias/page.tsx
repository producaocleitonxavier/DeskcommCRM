/**
 * /app/politico/vitorias — Radar de Vitórias (Situação Política).
 *
 * Lista as demandas RESOLVIDAS COM FOTO prontas pra virar card Antes & Depois —
 * pra situação política nunca passar batido. Cada uma abre o gerador. Agent+.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { listarVitorias } from "@/app/actions/politico/vitoria-actions";
import { CommandHero } from "@/components/politico/command-hero";

export const dynamic = "force-dynamic";

function formatarData(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default async function VitoriasPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const vitorias = await listarVitorias();

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1000px] px-4 py-7 space-y-5">
      <CommandHero
        eyebrow="Gabinete · Situação Política"
        titulo="Vitórias pra mostrar"
        subtitulo="Problemas resolvidos com foto, prontos pra virar card Antes & Depois. Não deixe nenhuma passar batido."
        acoes={[{ href: "/app/politico/demandas", label: "← Demandas" }]}
      />

      {vitorias.length === 0 ? (
        <section className="gip-glass p-10 text-center">
          <p className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Nenhuma vitória pronta ainda.</p>
          <p className="mt-1.5 text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Quando uma demanda com foto for <strong>resolvida</strong>, ela aparece aqui pra virar card. Dica: registre o problema com foto (Registrar na rua) e, ao resolver, adicione a foto do depois.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {vitorias.map((v) => (
            <Link
              key={v.demandaId}
              href={`/app/politico/vitorias/${v.demandaId}`}
              className="flex flex-col rounded-2xl p-4 transition-shadow hover:shadow-md"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderLeft: "4px solid #16A34A" }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "rgba(22,163,74,0.14)", color: "#15803D" }}>
                  ✓ Resolvida
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                  {v.fotos} {v.fotos === 1 ? "foto" : "fotos"}{v.fechadaEm ? ` · ${formatarData(v.fechadaEm)}` : ""}
                </span>
              </div>
              <span className="font-semibold leading-snug" style={{ color: "var(--color-text)", fontSize: 15 }}>{v.assunto}</span>
              {(v.bairro || v.orgao) && (
                <span className="mt-1.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {[v.bairro, v.orgao].filter(Boolean).join(" · ")}
                </span>
              )}
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--accent-ink, var(--color-accent))" }}>
                🪄 Transformar em vitória →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
